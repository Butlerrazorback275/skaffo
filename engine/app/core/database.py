"""SQLAlchemy engine / session wiring."""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import settings

engine = create_engine(
    settings.database_url,
    # `timeout` is passed to sqlite3.connect: how long a writer waits for the
    # lock before raising "database is locked". The default is 5s, but a
    # rapid burst of writes (an undo replays the whole schema) can exceed it.
    connect_args={"check_same_thread": False, "timeout": 30},
    # One shared connection avoids writers fighting each other inside the
    # process; SQLite only permits a single writer at a time anyway.
    poolclass=StaticPool,
    echo=False,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, _record):
    cur = dbapi_connection.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA journal_mode=WAL")
    # Belt and braces: also tell SQLite itself to retry for 30s.
    cur.execute("PRAGMA busy_timeout=30000")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from .. import models  # noqa: F401  (register mappers)

    Base.metadata.create_all(bind=engine)

    # Existing installs predate some columns; add them before anything reads.
    from .migrate import run_migrations
    run_migrations()
