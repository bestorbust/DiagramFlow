"""Set an administrator password explicitly: python -m backend.manage."""
import getpass
from backend.database import get_db_connection, hash_password


def main():
    password = getpass.getpass('New admin password (at least 12 characters): ')
    if len(password) < 12 or password != getpass.getpass('Confirm password: '):
        raise SystemExit('Password is too short or does not match.')
    with get_db_connection() as conn:
        conn.execute("INSERT INTO users(username,password_hash,role) VALUES('admin',?,'admin') ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash, role='admin'", (hash_password(password),))
    conn.close()
    print('Administrator password updated.')


if __name__ == '__main__':
    main()
