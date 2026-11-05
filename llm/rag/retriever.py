"""Local BM25 retrieval with stopword filtering and stable evidence identifiers."""
from __future__ import annotations
import math
import re
from collections import Counter

_STOP = set('a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my of on or our please should that the their them there these they this to us was were what when where which who why will with would you your tell about explain show give'.split())

def _tokenize(text):
    return [w for w in re.findall(r'[a-z0-9]+',str(text).lower()) if len(w)>1 and w not in _STOP]

class ArchitectureRetriever:
    def __init__(self, knowledge_chunks):
        self.chunks = [dict(c,id=c.get('id') or f'E{i+1:04}') for i,c in enumerate(knowledge_chunks)]
        self.doc_tokens = [_tokenize(c.get('title','')+' '+c.get('text','')) for c in self.chunks]
        self.doc_count=len(self.chunks)
        self.df=Counter(t for tokens in self.doc_tokens for t in set(tokens))
        self.avg_length=sum(map(len,self.doc_tokens))/max(1,self.doc_count)

    def retrieve(self,query,top_k=6,min_score=0.8):
        terms=set(_tokenize(query))
        if not terms or not self.chunks:
            return []
        scored=[]
        for chunk,tokens in zip(self.chunks,self.doc_tokens):
            tf=Counter(tokens)
            common=terms & tf.keys()
            if not common:
                continue
            score=0.0
            for term in common:
                idf=math.log(1+(self.doc_count-self.df[term]+0.5)/(self.df[term]+0.5))
                score += idf*(tf[term]*2.5)/(tf[term]+1.5*(0.25+0.75*len(tokens)/max(1,self.avg_length)))
            score += 0.5*len(common & set(_tokenize(chunk.get('title',''))))
            if score>=min_score:
                scored.append((chunk,score))
        return sorted(scored,key=lambda x:x[1],reverse=True)[:top_k]
