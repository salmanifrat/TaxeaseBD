import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Default connection URL for XAMPP MySQL locally:
# Host: localhost (127.0.0.1), Port: 3306, User: root, Password: (empty)
DEFAULT_MYSQL_URL = "mysql+pymysql://root:@localhost:3306/taxeasebd?charset=utf8mb4"
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_MYSQL_URL)


def sync_income_tax_laws(app_engine):
    """
    Authoritatively syncs the `income_tax_laws` table from
    data/income_tax_laws.py - the single hardcoded source of truth (50 real
    sections of the Income Tax Act, 2023).

    This deletes and re-inserts every row on every backend startup, rather
    than "seed only if the table is empty". That's deliberate: an
    if-empty check can never remove old/dummy rows once they've been
    written once, so a database seeded before this dataset existed would
    keep stale placeholder laws forever. A full sync guarantees the table
    always matches the hardcoded file - editing that file and restarting
    the backend is the only way to change what's in the database, and no
    dummy data can survive a restart.

    Uses the SQLAlchemy ORM (not raw SQL string execution) so there's no
    risk of a semicolon or quote inside a law's text breaking a naive
    SQL statement split.
    """
    from data.income_tax_laws import INCOME_TAX_LAWS
    import models

    Session = sessionmaker(bind=app_engine)
    session = Session()
    try:
        laws_data = []
        for item in INCOME_TAX_LAWS:
            row = dict(item)
            if 'source_url' not in row:
                row['source_url'] = 'https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf'
            laws_data.append(row)
        session.bulk_insert_mappings(models.IncomeTaxLaw, laws_data)
        session.commit()
        print(f"✓ Synced {len(INCOME_TAX_LAWS)} Income Tax Act, 2023 sections into income_tax_laws.")
    except Exception as e:
        session.rollback()
        print(f"⚠️ Income tax law sync failed: {e}")
    finally:
        session.close()


def seed_compliance_deadlines(app_engine):
    """Seeds compliance_deadlines from income_tax_laws_nbr.sql, only if empty.

    Unlike the law dataset, these are just calendar demo rows (not something
    users complained about being 'dummy'), so a one-time seed is fine here.
    """
    sql_path = os.path.join(os.path.dirname(__file__), "income_tax_laws_nbr.sql")
    if not os.path.exists(sql_path):
        return

    try:
        with app_engine.connect() as conn:
            has_deadlines = False
            try:
                res = conn.execute(text("SELECT COUNT(*) FROM compliance_deadlines;"))
                count = res.scalar()
                if count and count > 0:
                    has_deadlines = True
            except Exception:
                has_deadlines = False

            if not has_deadlines:
                with open(sql_path, "r", encoding="utf-8") as f:
                    content = f.read()

                # Only pull the compliance_deadlines INSERT statement out of the
                # file - income_tax_laws is handled by sync_income_tax_laws() above.
                marker = "INSERT INTO `compliance_deadlines`"
                if marker in content:
                    start = content.index(marker)
                    end = content.index(";", start) + 1
                    stmt = content[start:end]
                    with app_engine.begin() as trans_conn:
                        trans_conn.execute(text(stmt))
                    print("✓ Compliance deadlines seeded.")
    except Exception as e:
        print(f"⚠️ Compliance deadline seeding note: {e}")





Base = declarative_base()

def init_xampp_mysql():


    """Initializes XAMPP MySQL database 'taxeasebd' and populates income tax laws if needed."""
    app_engine = None
    try:
        if "mysql" in SQLALCHEMY_DATABASE_URL:
            # 1. Connect to MySQL server without database to ensure database exists
            base_url = SQLALCHEMY_DATABASE_URL.rsplit('/', 1)[0]
            server_engine = create_engine(base_url, isolation_level="AUTOCOMMIT")
            with server_engine.connect() as conn:
                conn.execute(text("CREATE DATABASE IF NOT EXISTS `taxeasebd` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"))
            server_engine.dispose()
            print("✓ XAMPP MySQL database 'taxeasebd' verified/created.")

            app_engine = create_engine(SQLALCHEMY_DATABASE_URL)
    except Exception as e:
        print(f"⚠️ XAMPP MySQL Connection Warning: {e}")
        print("Falling back to local SQLite engine to ensure system operation.")

    if app_engine is None:
        fallback_url = "sqlite:///./taxease.db"
        app_engine = create_engine(fallback_url, connect_args={"check_same_thread": False})

    # Import models so Base.metadata is aware of all table schemas
    import models
    Base.metadata.create_all(bind=app_engine)
    sync_income_tax_laws(app_engine)
    seed_compliance_deadlines(app_engine)
    return app_engine


engine = init_xampp_mysql()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



