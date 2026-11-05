"""Reconcile geometric cards, floating symbols, and exterior OCR labels.

No service names or image-specific coordinates are used. Physical attachment
regions remain distinct from the logical union of a symbol and its label.
"""
from __future__ import annotations

import cv2
import numpy as np


def contains(outer, inner, margin=3):
    x, y, w, h = outer
    a, b, c, d = inner
    return x-margin <= a and y-margin <= b and a+c <= x+w+margin and b+d <= y+h+margin


def union(boxes):
    x = min(b[0] for b in boxes); y = min(b[1] for b in boxes)
    return [x, y, max(b[0]+b[2] for b in boxes)-x, max(b[1]+b[3] for b in boxes)-y]


def reading_order(words):
    lines = []
    for word in sorted(words, key=lambda t: (t['center'][1], t['center'][0])):
        line = next((line for line in lines if abs(np.median([w['center'][1] for w in line]) - word['center'][1])
                     <= max(4, word['bbox'][3]*.55)), None)
        if line is None:
            lines.append([word])
        else:
            line.append(word)
    return [word for line in lines for word in sorted(line, key=lambda t:t['bbox'][0])]


class VisualComponentDetector:
    """Discover compact symbols and reconcile them with existing shape boxes."""

    def detect(self, image, shapes, words):
        self.observations=[]
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        color = ((hsv[:,:,1] > 65) & (hsv[:,:,2] > 65)).astype(np.uint8)*255
        # Colored fonts and subpixel antialiasing must not become icon blobs.
        # Erase sparse OCR regions, while preserving lettering inside a solid
        # colored symbol (for example a white label within a cloud icon).
        for word in words:
            x,y,w,h=word['bbox']
            region=color[max(0,y-1):y+h+1,max(0,x-1):x+w+1]
            if region.size and h<=28 and word.get('confidence',0)>=.45 and np.mean(region>0)<.50:
                region[:]=0
            elif region.size and word['text'].isdigit() and .75<w/max(1,h)<1.25 and np.mean(region>0)>.55:
                word['kind']='callout'
        color = cv2.morphologyEx(color, cv2.MORPH_CLOSE, np.ones((7,7),np.uint8))
        count, labels, stats, _ = cv2.connectedComponentsWithStats(color)
        icons = []
        for idx in range(1, count):
            x,y,w,h,area = map(int, stats[idx])
            if min(w,h)<20 or max(w,h)>220 or not .30 < w/h < 3.0 or area/(w*h)<.18:
                continue
            # Small circular numbered callouts are observations, not services.
            if w*h<1000:
                self.observations.append({'bbox':[x,y,w,h], 'kind':'unclassified_compact_symbol',
                    'confidence':.4,'detail':'Small visible symbol or callout; no architectural role established.'})
                continue
            pixels = image[y:y+h,x:x+w][labels[y:y+h,x:x+w]==idx]
            # A uniformly filled rectangular card belongs to the shape path.
            if area/(w*h)>.85 and np.mean(np.std(pixels.astype(float),axis=0))<12:
                continue
            box=[x,y,w,h]
            # Keep symbols inside cards only if their labels can be separated
            # visually from the symbol; otherwise the card remains authoritative.
            icons.append({'bbox':box, 'symbol_bbox':box, 'shape':'icon',
                'center':[x+w//2,y+h//2], 'area':w*h, 'confidence':.85,
                'is_container':False, 'detection_method':'color_connected_symbol'})

        # Compact monochrome shapes with exterior labels use the same joint
        # association, rather than being discarded because they have no color.
        from cv.src.shape_detector import calculate_iou
        for shape in shapes:
            x,y,w,h=shape['bbox']
            if shape.get('is_container') or min(w,h)<24 or max(w,h)>160 or not .45<w/h<2.2:
                continue
            if any(calculate_iou(shape['bbox'],icon['bbox'])>.4 for icon in icons):
                continue
            interior=[t for t in words if x<t['center'][0]<x+w and y<t['center'][1]<y+h
                and t.get('confidence',0)>=.7 and len(t['text'])>2 and t['bbox'][3]<h*.6]
            exterior=[t for t in words if 0<=t['bbox'][1]-(y+h)<=max(30,h*.75)
                and abs(t['center'][0]-(x+w/2))<w and t.get('confidence',0)>=.6 and any(c.isalpha() for c in t['text'])]
            if not interior and exterior:
                icons.append(dict(shape,shape='icon',symbol_bbox=shape['bbox'],
                    detection_method='classical_symbol'))

        assigned = [[] for _ in icons]
        for word in words:
            if word.get('confidence',0)<.5 or not any(ch.isalpha() for ch in word['text']):
                continue
            tx,ty,tw,th=word['bbox']; mx,my=word['center']
            costs=[]
            for i,icon in enumerate(icons):
                x,y,w,h=icon['bbox']; cx=x+w/2
                gap=ty-(y+h)
                overlap=min(tx+tw,x+w)-max(tx,x)
                if -2 <= gap <= max(90, h*1.8) and overlap>-max(20,th*2) and abs(mx-cx)<max(w*1.2,tw*.65):
                    # Do not associate through a different physical object.
                    blocked=any(j!=i and other['bbox'][1]>=y+h-2 and other['bbox'][1]<ty and
                        other['bbox'][0]<=cx<=other['bbox'][0]+other['bbox'][2] for j,other in enumerate(icons))
                    if not blocked:
                        costs.append((gap+abs(mx-cx)*.7,i))
            costs.sort()
            if costs and (len(costs)==1 or costs[1][0]-costs[0][0]>3):
                assigned[costs[0][1]].append(word)

        recovered=[]
        for icon, matches in zip(icons,assigned):
            ordered=reading_order(matches)
            if not ordered:
                continue
            # A separated footer or group title is not part of the icon label.
            selected=[]; bottom=icon['bbox'][1]+icon['bbox'][3]
            for word in ordered:
                x,y,w,h=word['bbox']
                limit=max(28, icon['bbox'][3]*.65) if not selected else max(8,h*.85)
                if y-bottom>limit:
                    break
                selected.append(word);bottom=max(bottom,y+h)
            if not selected:
                continue
            icon['label']=' '.join(w['text'] for w in selected)
            icon['label_words']=selected
            icon['label_bbox']=union([w['bbox'] for w in selected])
            icon['logical_bbox']=union([icon['bbox'],icon['label_bbox']])
            icon['ocr_confidence']=float(np.mean([w['confidence'] for w in selected]))
            recovered.append(icon)

        # A thin colored or pale enclosure can be missed by the dark-stroke
        # detector. Accept it only when it surrounds a recovered symbol+label
        # and has four independently visible sides.
        shapes=list(shapes)
        gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
        contours,_=cv2.findContours(cv2.Canny(gray,10,35),cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x,y,w,h=cv2.boundingRect(contour);box=[x,y,w,h]
            if min(w,h)<35 or cv2.contourArea(contour)/max(1,w*h)<.85:
                continue
            if not any(contains(box,i['logical_bbox'],1) for i in recovered):
                continue
            if not self._has_boundary(image,box):
                continue
            from cv.src.shape_detector import calculate_iou
            if any(calculate_iou(box,s['bbox'])>.8 for s in shapes):
                continue
            shapes.append({'bbox':box,'center':[x+w//2,y+h//2],'area':w*h,
                'shape':'rectangle','confidence':.8,'is_container':False})

        # Reconcile larger enclosures first so their attachment regions can
        # also suppress partial contours around the label at the bottom.
        shapes.sort(key=lambda s:s['area'],reverse=True)
        retained=[]
        for shape in shapes:
            if any(contains(icon['symbol_bbox'],shape['bbox'],4) for icon in recovered):
                continue
            if any(contains(icon['logical_bbox'],shape['bbox'],4) for icon in recovered):
                continue
            if any(icon.get('attachment_bbox') and contains(icon['attachment_bbox'],shape['bbox'],3) for icon in recovered):
                continue
            enclosed=[i for i in recovered if contains(shape['bbox'],i['symbol_bbox'])]
            if not enclosed:
                retained.append(shape);continue
            # Preserve an enclosing card for docking, but avoid duplicate nodes
            # for sub-contours within a colored symbol.
            if len(enclosed)==1:
                icon=enclosed[0]
                if contains(shape['bbox'],icon['logical_bbox']) and shape['area']<icon['area']*7:
                    old=icon.get('attachment_bbox')
                    if old is None or shape['area']<old[2]*old[3]:
                        icon['attachment_bbox']=shape['bbox']
                elif shape.get('is_container') and shape['area']>icon['area']*7:
                    retained.append(shape)
            else:
                shape=dict(shape, is_container=True)
                # Reject a putative enclosure unless all four sides have
                # boundary evidence. A connector plus a card is not a group.
                if self._has_boundary(image,shape['bbox']):
                    retained.append(shape)
        for icon in recovered:
            icon['bbox']=icon.get('attachment_bbox',icon['symbol_bbox'])
            x,y,w,h=icon['bbox'];icon['center']=[x+w//2,y+h//2];icon['area']=w*h
        self.observations=[o for o in self.observations if not any(contains(i['bbox'],o['bbox'])
            for i in retained+recovered if not i.get('is_container'))]
        return retained+recovered

    @staticmethod
    def _has_boundary(image, box):
        x,y,w,h=box
        gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
        edges=cv2.dilate(cv2.Canny(gray,20,60),np.ones((5,5),np.uint8))
        x2=min(gray.shape[1]-1,x+w);y2=min(gray.shape[0]-1,y+h)
        sides=[edges[y,x:x2],edges[y2,x:x2],edges[y:y2,x],edges[y:y2,x2]]
        return all(len(side) and np.mean(side>0)>.30 for side in sides)
