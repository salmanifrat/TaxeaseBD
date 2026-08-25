import os
from sqlalchemy import String, create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Default connection URL for XAMPP MySQL locally:
# Host: localhost (127.0.0.1), Port: 3306, User: root, Password: (empty)
DEFAULT_MYSQL_URL = "mysql+pymysql://root:@localhost:3306/taxeasebd?charset=utf8mb4"
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_MYSQL_URL)


def _sync_reference_table(app_engine, model_cls, rows, defaults=None):
    """
    Authoritatively syncs a reference table (drop table, recreate with the
    current model schema, insert the given rows) instead of "seed only if
    empty". An if-empty check can never fix rows that are already wrong
    or a column that models.py added after the table existed - a full
    sync guarantees the table always matches the hardcoded Python source.
    Only used for our own reference data (income tax laws, compliance
    deadlines), never for user data.
    """
    model_cls.__table__.drop(app_engine, checkfirst=True)
    model_cls.__table__.create(app_engine, checkfirst=True)

    Session = sessionmaker(bind=app_engine)
    session = Session()
    try:
        data = []
        for item in rows:
            row = dict(item)
            for key, value in (defaults or {}).items():
                row.setdefault(key, value)
            data.append(row)
        session.bulk_insert_mappings(model_cls, data)
        session.commit()
        print(f"✓ Synced {len(data)} rows into {model_cls.__tablename__}.")
    except Exception as e:
        session.rollback()
        print(f"⚠️ Sync failed for {model_cls.__tablename__}: {e}")
    finally:
        session.close()


def sync_income_tax_laws(app_engine):
    from data.income_tax_laws import INCOME_TAX_LAWS
    import models
    _sync_reference_table(
        app_engine, models.IncomeTaxLaw, INCOME_TAX_LAWS,
        defaults={"source_url": "https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf"},
    )


def sync_compliance_deadlines(app_engine):
    from data.compliance_deadlines import COMPLIANCE_DEADLINES
    import models
    _sync_reference_table(app_engine, models.ComplianceDeadline, COMPLIANCE_DEADLINES)


def _auto_migrate_columns(app_engine):
    """
    Adds any column a model has that the live table is missing (e.g. new
    User fields added after a `users` table already existed in a real
    database - Base.metadata.create_all() only creates missing tables, it
    never alters an existing one). Only ever ADDS nullable columns, so
    this can't lose data. Safe on every startup.
    """
    import models

    inspector = inspect(app_engine)
    existing_tables = set(inspector.get_table_names())

    with app_engine.begin() as conn:
        for table_name, table in models.Base.metadata.tables.items():
            if table_name not in existing_tables:
                continue
            existing_columns = {c["name"] for c in inspector.get_columns(table_name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                try:
                    col_type = column.type.compile(dialect=app_engine.dialect)
                except Exception:
                    # MySQL requires a length on VARCHAR; some models use
                    # unbounded String(), which SQLite tolerates but MySQL doesn't.
                    col_type = "VARCHAR(255)" if isinstance(column.type, String) else "TEXT"
                try:
                    conn.execute(text(f'ALTER TABLE `{table_name}` ADD COLUMN `{column.name}` {col_type}'))
                    print(f"✓ Added missing column {table_name}.{column.name}")
                except Exception as e:
                    print(f"⚠️ Could not add column {table_name}.{column.name}: {e}")


Base = declarative_base()


def init_xampp_mysql():
    """Connects to the local XAMPP MySQL instance, creating the database if
    needed; falls back to SQLite if MySQL isn't reachable."""
    app_engine = None
    try:
        if "mysql" in SQLALCHEMY_DATABASE_URL:
            base_url = SQLALCHEMY_DATABASE_URL.rsplit('/', 1)[0]
            server_engine = create_engine(base_url, isolation_level="AUTOCOMMIT")
            with server_engine.connect() as conn:
                conn.execute(text("CREATE DATABASE IF NOT EXISTS `taxeasebd` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"))
            server_engine.dispose()
            print("✓ XAMPP MySQL database 'taxeasebd' verified/created.")
            app_engine = create_engine(SQLALCHEMY_DATABASE_URL)
    except Exception as e:
        print(f"⚠️ XAMPP MySQL connection failed, falling back to SQLite: {e}")

    if app_engine is None:
        app_engine = create_engine("sqlite:///./taxease.db", connect_args={"check_same_thread": False})

    import models
    Base.metadata.create_all(bind=app_engine)
    _auto_migrate_columns(app_engine)
    sync_income_tax_laws(app_engine)
    sync_compliance_deadlines(app_engine)
    return app_engine


engine = init_xampp_mysql()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
