
import sys
import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from psycopg2 import sql
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from .engine import engine, Base, SessionLocal
from .models import (
    User, LocationCoordinate, TripTimeConfig,
    FleetManagement, RoutingConstraint, SystemConfig,
    Weighbridge
)
from ..logger import logger

def create_database_if_not_exists():
    load_dotenv()
    db_name = os.getenv("DATABASE_NAME", "hmd")
    db_user = os.getenv("DATABASE_USER", "postgres")
    db_password = os.getenv("DATABASE_PASSWORD", "postgres")
    db_host = os.getenv("DATABASE_HOST", "localhost")
    db_port = os.getenv("DATABASE_PORT", "5432")

    logger.info(f"Checking if database '{db_name}' exists...")

    try:
                                                                                    
        conn = psycopg2.connect(
            dbname='postgres',
            user=db_user,
            password=db_password,
            host=db_host,
            port=db_port
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s", (db_name,))
        exists = cur.fetchone()

        if not exists:
            logger.info(f"Database '{db_name}' not found. Creating...")
                                                                 
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))
            logger.success(f"Database '{db_name}' created successfully.")
        else:
            logger.info(f"Database '{db_name}' already exists.")

        cur.close()
        conn.close()
    except Exception as e:
        logger.error(f"Error checking/creating database: {e}")
                                                                     
def check_alembic_version(db) -> bool:
    from sqlalchemy import text

    try:
        result = db.execute(text("SELECT version_num FROM alembic_version"))
        version = result.fetchone()
        if version:
            logger.info(f"Database migration version: {version[0]}")
            return True
        return False
    except Exception:
                                                                                    
        db.rollback()
        return False

def ensure_schema_columns():
    from sqlalchemy import text, inspect

    TYPE_MAP = {
        "TIMESTAMP WITH TIME ZONE": "TIMESTAMP WITH TIME ZONE",
        "FLOAT": "DOUBLE PRECISION",
        "INTEGER": "INTEGER",
        "VARCHAR": "VARCHAR",
        "STRING": "VARCHAR",
        "BOOLEAN": "BOOLEAN",
        "TEXT": "TEXT",
        "DATE": "DATE",
    }

    EXPECTED_COLUMNS = {
        "trips": [
                                                             
            ("wb_tare_entry_at", "TIMESTAMP WITH TIME ZONE", None),
            ("wb_tare_recorded_at", "TIMESTAMP WITH TIME ZONE", None),
            ("wb_gross_entry_at", "TIMESTAMP WITH TIME ZONE", None),
            ("wb_gross_recorded_at", "TIMESTAMP WITH TIME ZONE", None),
            ("expected_wb_tare_entry_at", "TIMESTAMP WITH TIME ZONE", None),
            ("expected_wb_tare_recorded_at", "TIMESTAMP WITH TIME ZONE", None),
            ("expected_wb_gross_entry_at", "TIMESTAMP WITH TIME ZONE", None),
            ("expected_wb_gross_recorded_at", "TIMESTAMP WITH TIME ZONE", None),
                                     
            ("tare_weight_kg", "DOUBLE PRECISION", None),
            ("gross_weight_kg", "DOUBLE PRECISION", None),
            ("net_weight_kg", "DOUBLE PRECISION", None),
                            
            ("equipment_id", "INTEGER", None),
                                                                        
            ("expected_duration_minutes", "DOUBLE PRECISION", None),
            ("expected_p_entered_at", "TIMESTAMP WITH TIME ZONE", None),
            ("expected_p_loading_start_at", "TIMESTAMP WITH TIME ZONE", None),
            ("expected_p_loading_end_at", "TIMESTAMP WITH TIME ZONE", None),
            ("expected_p_exited_at", "TIMESTAMP WITH TIME ZONE", None),
            ("expected_c_entered_at", "TIMESTAMP WITH TIME ZONE", None),
            ("expected_c_unloading_start_at", "TIMESTAMP WITH TIME ZONE", None),
            ("expected_c_unloading_end_at", "TIMESTAMP WITH TIME ZONE", None),
            ("expected_c_exited_at", "TIMESTAMP WITH TIME ZONE", None),
                                                                    
            ("shift", "VARCHAR", None),
            ("delay_cost", "DOUBLE PRECISION", None),
            ("operational_cost", "DOUBLE PRECISION", None),
            ("converter_id", "INTEGER", None),
            ("temperature_at_loading", "DOUBLE PRECISION", None),
            ("temperature_at_unloading", "DOUBLE PRECISION", None),
            ("temperature_loss", "DOUBLE PRECISION", None),
            ("cycle_time_minutes", "DOUBLE PRECISION", None),
            ("last_updated", "TIMESTAMP WITH TIME ZONE", None),
            ("deleted_at", "TIMESTAMP WITH TIME ZONE", None),
        ],
        "converters": [
            ("equipment_type", "VARCHAR", "'BOF'"),
            ("deleted_at", "TIMESTAMP WITH TIME ZONE", None),
        ],
        "users": [
            ("email", "VARCHAR(255)", None),
                         
            ("deleted_at", "TIMESTAMP WITH TIME ZONE", None),
                             
            ("failed_login_attempts", "INTEGER", "0"),
            ("locked_until", "TIMESTAMP WITH TIME ZONE", None),
        ],
        "fleet_management": [
            ("deleted_at", "TIMESTAMP WITH TIME ZONE", None),
        ],
    }

    try:
        with engine.connect() as conn:
            inspector = inspect(engine)
            total_added = 0

            for table_name, columns in EXPECTED_COLUMNS.items():
                                       
                if not inspector.has_table(table_name):
                    continue

                existing_cols = {col["name"] for col in inspector.get_columns(table_name)}

                for col_name, col_type, default_val in columns:
                    if col_name not in existing_cols:
                                                     
                        default_clause = f" DEFAULT {default_val}" if default_val else ""
                        alter_sql = f'ALTER TABLE {table_name} ADD COLUMN "{col_name}" {col_type}{default_clause}'
                        conn.execute(text(alter_sql))
                        total_added += 1
                        logger.info(f"  Added column: {table_name}.{col_name} ({col_type})")

            if total_added > 0:
                conn.commit()
                logger.success(f"Schema sync complete: added {total_added} missing column(s).")
            else:
                logger.info("Schema sync: all columns present.")

    except Exception as e:
        logger.error(f"Schema sync failed: {e}")

def init_db():
                                      
    from ..utils.security import get_password_hash

    create_database_if_not_exists()

    logger.info("Initializing database schema...")
    try:
                                                                                           
        Base.metadata.create_all(bind=engine)

        ensure_schema_columns()

        db = SessionLocal()
        try:
                                                       
            if not check_alembic_version(db):
                logger.info("Alembic migrations not detected. Stamping current schema version...")
                try:
                                                                          
                    from alembic.config import Config
                    from alembic import command

                    alembic_cfg = Config(os.path.join(os.path.dirname(__file__), '..', 'alembic.ini'))
                    alembic_cfg.set_main_option('script_location', os.path.join(os.path.dirname(__file__), '..', 'alembic'))
                    command.stamp(alembic_cfg, 'head')
                    logger.success("Database stamped with latest migration version.")
                except Exception as e:
                    logger.warning(f"Could not stamp Alembic version: {e}. You may need to run migrations manually.")

            if db.query(User).count() == 0:
                logger.info("Seeding initial users with hashed passwords...")
                initial_users = [
                    User(username="admin", password=get_password_hash("Admin@123"), role="admin"),
                               
                    User(username="SMS-1", password=get_password_hash("Sms1@123"), role="consumer", user_id="SMS-1"),
                    User(username="SMS-2", password=get_password_hash("Sms2@123"), role="consumer", user_id="SMS-2"),
                    User(username="SMS-3", password=get_password_hash("Sms3@123"), role="consumer", user_id="SMS-3"),
                    User(username="SMS-4", password=get_password_hash("Sms4@123"), role="consumer", user_id="SMS-4"),
                               
                    User(username="BF-1", password=get_password_hash("Bf1@123"), role="producer", user_id="BF-1"),
                    User(username="BF-2", password=get_password_hash("Bf2@123"), role="producer", user_id="BF-2"),
                    User(username="BF-3", password=get_password_hash("Bf3@123"), role="producer", user_id="BF-3"),
                    User(username="BF-4", password=get_password_hash("Bf4@123"), role="producer", user_id="BF-4"),
                    User(username="BF-5", password=get_password_hash("Bf5@123"), role="producer", user_id="BF-5"),
                    User(username="Corex-1", password=get_password_hash("Corex1@123"), role="producer", user_id="Corex-1"),
                    User(username="Corex-2", password=get_password_hash("Corex2@123"), role="producer", user_id="Corex-2"),
                ]
                db.add_all(initial_users)
                db.commit()
                logger.success("Initial users seeded successfully with hashed passwords.")

            if db.query(TripTimeConfig).count() == 0:
                logger.info("Seeding initial trip time configurations...")
                prods = db.query(User).filter(User.role == 'producer').all()
                cons = db.query(User).filter(User.role == 'consumer').all()
                for p in prods:
                    for c in cons:
                        if p.user_id and c.user_id:
                            db.add(TripTimeConfig(source_user_id=p.user_id, destination_user_id=c.user_id, travel_time=15))
                db.commit()
                logger.success("Initial trip times seeded.")

            logger.info("Checking for missing initial locations...")
            required_locations = [
                {"location_name": "jsw", "user_id": None, "type": "main_plant", "x": 15.182659, "y": 76.657708, "is_visible": False},
                {"location_name": "Blast Furnace 1", "user_id": "BF-1", "type": "producer", "x": 15.183063, "y": 76.641965, "is_visible": True},
                {"location_name": "Blast Furnace 2", "user_id": "BF-2", "type": "producer", "x": 15.184733, "y": 76.638936, "is_visible": True},
                {"location_name": "Blast Furnace 3", "user_id": "BF-3", "type": "producer", "x": 15.171413, "y": 76.662968, "is_visible": True},
                {"location_name": "Blast Furnace 4", "user_id": "BF-4", "type": "producer", "x": 15.169902, "y": 76.666707, "is_visible": True},
                {"location_name": "Blast Furnace 5", "user_id": "BF-5", "type": "producer", "x": 15.180132, "y": 76.679279, "is_visible": True},
                {"location_name": "COREX 1", "user_id": "Corex-1", "type": "producer", "x": 15.181381, "y": 76.645092, "is_visible": True},
                {"location_name": "COREX 2", "user_id": "Corex-2", "type": "producer", "x": 15.182272, "y": 76.643499, "is_visible": True},
                {"location_name": "SMS 1", "user_id": "SMS-1", "type": "consumer", "x": 15.182539, "y": 76.651598, "is_visible": True},
                {"location_name": "SMS 2", "user_id": "SMS-2", "type": "consumer", "x": 15.186606, "y": 76.657165, "is_visible": True},
                {"location_name": "SMS 3", "user_id": "SMS-3", "type": "consumer", "x": 15.178296, "y": 76.665386, "is_visible": True},
                {"location_name": "SMS 4", "user_id": "SMS-4", "type": "consumer", "x": 15.186665, "y": 76.674931, "is_visible": True},
            ]

            added_count = 0
            updated_count = 0
            for loc_data in required_locations:
                loc = db.query(LocationCoordinate).filter(LocationCoordinate.location_name == loc_data["location_name"]).first()
                if not loc:
                    db.add(LocationCoordinate(**loc_data, status="Operating"))
                    added_count += 1
                else:
                                                                                      
                    loc.user_id = loc_data.get("user_id")
                    loc.type = loc_data.get("type")
                    if loc.status is None:
                        loc.status = "Operating"
                    updated_count += 1

            if added_count > 0 or updated_count > 0:
                db.commit()
                if added_count > 0:
                    logger.success(f"Added {added_count} missing initial locations.")
                if updated_count > 0:
                    logger.info(f"Synchronized {updated_count} existing locations.")
            else:
                logger.info("All initial locations are already present.")

            if db.query(RoutingConstraint).count() == 0:
                logger.info("Seeding initial routing constraints...")
                legacy_rules = {
                    'BF-1': ['SMS-1', 'SMS-2'],
                    'BF-2': ['SMS-1', 'SMS-2'],
                    'Corex-1': ['SMS-1', 'SMS-2'],
                    'Corex-2': ['SMS-1', 'SMS-2'],
                    'BF-3': ['SMS-2', 'SMS-3'],
                    'BF-4': ['SMS-2', 'SMS-3'],
                    'BF-5': ['SMS-2', 'SMS-4']
                }
                constraints = []
                for prod, consumers in legacy_rules.items():
                    for cons in consumers:
                        constraints.append(RoutingConstraint(producer_id=prod, consumer_id=cons))
                db.add_all(constraints)
                db.commit()
                logger.success("Initial routing constraints seeded.")

            logger.info("Checking system configurations...")
            required_configs = [
                {"config_key": "NOMINAL_CAPACITY", "config_value": "150.0", "description": "Fallback torpedo capacity in MT"},
                {"config_key": "DEFAULT_TRAVEL_TIME", "config_value": "30", "description": "Fallback travel time in minutes if not configured"},
                {"config_key": "TRAVEL_TO_PRODUCER_MINUTES", "config_value": "15", "description": "Time (min) for torpedo to travel from depot to producer after assignment"},
                {"config_key": "EXIT_BUFFER_MINUTES", "config_value": "5", "description": "Buffer time (min) after loading/unloading completes before exit"},
                {"config_key": "DEFAULT_WAIT_TIME", "config_value": "10", "description": "Default queue wait time (min) if not configured per location"},
                {"config_key": "DEFAULT_FILL_TIME", "config_value": "30", "description": "Default fill/loading time (min) if not configured per producer"},
                {"config_key": "DEFAULT_UNLOAD_TIME", "config_value": "20", "description": "Default unload time (min) if not configured per consumer"},
                                        
                {"config_key": "WHATSAPP_ENABLED", "config_value": "false", "description": "Enable/disable WhatsApp notifications system-wide"},
                {"config_key": "WHATSAPP_SERVICE_URL", "config_value": "http://localhost:3002", "description": "URL of the WhatsApp Node.js microservice"},
                {"config_key": "WHATSAPP_DAILY_REPORT_TIME", "config_value": "18:00", "description": "Time (HH:MM) to send daily WhatsApp reports"},
                {"config_key": "WHATSAPP_RATE_LIMIT", "config_value": "20", "description": "Maximum WhatsApp messages per minute"},
                {"config_key": "WHATSAPP_DEFAULT_LANGUAGE", "config_value": "en", "description": "Default language for WhatsApp messages (en, hi, kn, te, ta, mr, gu, bn)"},
                                           
                {"config_key": "TRAVEL_TO_WEIGHBRIDGE_MINUTES", "config_value": "10", "description": "Travel time from assignment to weighbridge (minutes)"},
                {"config_key": "WEIGHBRIDGE_PROCESS_TIME_MINUTES", "config_value": "10", "description": "Time to weigh and record at weighbridge (minutes)"},
                {"config_key": "TRAVEL_WB_TO_PRODUCER_MINUTES", "config_value": "10", "description": "Travel time from weighbridge to producer (minutes)"},
                {"config_key": "TRAVEL_PRODUCER_TO_WB_MINUTES", "config_value": "10", "description": "Travel time from producer to weighbridge (minutes)"},
                {"config_key": "TRAVEL_WB_TO_CONSUMER_MINUTES", "config_value": "15", "description": "Travel time from weighbridge to consumer (minutes)"},

                # Hot Metal chemistry spec thresholds — used by V2 Dashboard
                # Card 5 (ON-SPEC %). Industry-standard defaults based on the
                # 30-day probe sample at BF4 (2026-05-13, see
                # test_on_spec_probe.py + changes_tracker #179). Edit in
                # Strategic Planning → System Settings if JSW updates the spec.
                {"config_key": "SPEC_S_MAX",  "config_value": "0.05", "description": "Hot Metal sulfur upper limit (%) — trips above this are out of spec"},
                {"config_key": "SPEC_SI_MIN", "config_value": "0.30", "description": "Hot Metal silicon lower limit (%) — below this = cold metal risk at SMS"},
                {"config_key": "SPEC_SI_MAX", "config_value": "1.20", "description": "Hot Metal silicon upper limit (%) — above this stresses BOF slag chemistry"},
            ]
            added_count = 0
            for cfg_data in required_configs:
                existing = db.query(SystemConfig).filter(SystemConfig.config_key == cfg_data["config_key"]).first()
                if not existing:
                    db.add(SystemConfig(**cfg_data))
                    added_count += 1
            if added_count > 0:
                db.commit()
                logger.success(f"Added {added_count} missing system configurations.")

            default_weighbridges = [
                {"name": "WB-1", "location_name": "Weighbridge 1", "status": "Operating"},
                {"name": "WB-2", "location_name": "Weighbridge 2", "status": "Operating"},
            ]
            for wb_data in default_weighbridges:
                existing = db.query(Weighbridge).filter(Weighbridge.name == wb_data["name"]).first()
                if not existing:
                    wb = Weighbridge(**wb_data)
                    db.add(wb)
                    logger.info(f"Seeded weighbridge: {wb_data['name']}")

            if db.query(FleetManagement).count() == 0:
                logger.info("Seeding initial fleet data (TLC-01 to TLC-44)...")
                fleet = []
                for i in range(1, 45):
                    torpedo_id = f"TLC-{i:02d}"
                    fleet.append(FleetManagement(
                        fleet_id=torpedo_id,
                        type="torpedo",
                        capacity=360.0,
                        status="Operating"
                    ))
                db.add_all(fleet)
                db.commit()
                logger.success(f"Successfully seeded {len(fleet)} torpedoes.")

            logger.success("Database initialization completed successfully.")

        except Exception as e:
            logger.error(f"Error during data seeding: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Error during schema initialization: {e}")
        sys.exit(1)

if __name__ == "__main__":
    init_db()
