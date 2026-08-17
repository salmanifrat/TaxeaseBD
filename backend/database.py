import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Default to SQLite for local development (taxease.db).
# In production, set DATABASE_URL=postgresql://user:pass@host/dbname in .env
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./taxease.db")

# Create engine (check_same_thread false is only needed for SQLite)
connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get DB session in FastAPI routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
