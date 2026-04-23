import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["CSRF_ENABLED"] = "false"

os.environ["RATE_LIMIT_ENABLED"] = "false"

from unittest.mock import MagicMock
import backend.main as _main_module
_main_module.scheduler = MagicMock()

from backend.main import app
from backend.database.engine import get_db
from backend.database.models import Base, User
from backend.utils.security import get_password_hash
from backend.utils.cache import fleet_cache, config_cache, plans_cache, general_cache
from backend.utils.redis_cache import cache as redis_cache

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="function")
def db_session():
                                                           
    fleet_cache.clear()
    config_cache.clear()
    plans_cache.clear()
    general_cache.clear()
    redis_cache.clear_all()

    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
                                         
        fleet_cache.clear()
        config_cache.clear()
        plans_cache.clear()
        general_cache.clear()
        redis_cache.clear_all()

@pytest.fixture(scope="function")
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def admin_user(db_session):
    user = User(
        username="admin_test",
        password=get_password_hash("admin123"),
        role="admin",
        user_id="ADMIN001"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def producer_user(db_session):
    user = User(
        username="producer_test",
        password=get_password_hash("producer123"),
        role="producer",
        user_id="BF001"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def consumer_user(db_session):
    user = User(
        username="consumer_test",
        password=get_password_hash("consumer123"),
        role="consumer",
        user_id="SMS001"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def admin_token(client, admin_user):
    response = client.post(
        "/api/auth/login",
        json={"username": "admin_test", "password": "admin123"}
    )
    assert response.status_code == 200, f"Login failed: {response.json()}"
    return response.json()["access_token"]

@pytest.fixture
def producer_token(client, producer_user):
    response = client.post(
        "/api/auth/login",
        json={"username": "producer_test", "password": "producer123"}
    )
    assert response.status_code == 200, f"Login failed: {response.json()}"
    return response.json()["access_token"]

@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture
def producer_headers(producer_token):
    return {"Authorization": f"Bearer {producer_token}"}

@pytest.fixture
def consumer_token(client, consumer_user):
    response = client.post(
        "/api/auth/login",
        json={"username": "consumer_test", "password": "consumer123"}
    )
    assert response.status_code == 200, f"Login failed: {response.json()}"
    return response.json()["access_token"]

@pytest.fixture
def consumer_headers(consumer_token):
    return {"Authorization": f"Bearer {consumer_token}"}

@pytest.fixture
def fleet_torpedo(db_session):
    from backend.database.models import FleetManagement

    torpedo = FleetManagement(
        fleet_id="TLC-TEST-01",
        type="torpedo",
        status="Operating",
        capacity=360.0
    )
    db_session.add(torpedo)
    db_session.commit()
    db_session.refresh(torpedo)
    return torpedo

@pytest.fixture
def sample_trip(db_session, fleet_torpedo):
    from backend.database.models import Trip
    from backend.constants import TripStatus

    trip = Trip(
        trip_id="TEST-TRIP-001",
        producer_id="BF001",
        consumer_id="SMS001",
        torpedo_id=fleet_torpedo.fleet_id,
        status=TripStatus.ASSIGNED
    )
    db_session.add(trip)
    db_session.commit()
    db_session.refresh(trip)
    return trip

@pytest.fixture
def pending_trip(db_session):
    from backend.database.models import Trip
    from backend.constants import TripStatus

    trip = Trip(
        trip_id="TEST-PENDING-001",
        producer_id="BF001",
        consumer_id="SMS001",
        status=TripStatus.PENDING
    )
    db_session.add(trip)
    db_session.commit()
    db_session.refresh(trip)
    return trip

@pytest.fixture
def system_config(db_session):
    from backend.database.models import SystemConfig

    configs = [
        SystemConfig(config_key="TRAVEL_TO_PRODUCER_MINUTES", config_value="15"),
        SystemConfig(config_key="EXIT_BUFFER_MINUTES", config_value="5"),
        SystemConfig(config_key="DEFAULT_WAIT_TIME", config_value="10"),
        SystemConfig(config_key="DEFAULT_FILL_TIME", config_value="30"),
        SystemConfig(config_key="DEFAULT_UNLOAD_TIME", config_value="20"),
        SystemConfig(config_key="DEFAULT_TRAVEL_TIME", config_value="25"),
    ]
    db_session.add_all(configs)
    db_session.commit()
    return configs
