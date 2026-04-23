import pytest
from backend.database.models import LocationCoordinate, MaintenanceSchedule
from datetime import date, timedelta

@pytest.fixture
def sample_location(db_session):
    location = LocationCoordinate(
        location_name="Test Blast Furnace",
        user_id="BF-TEST-01",
        type="producer",
        x=100.0,
        y=200.0,
        is_visible=True,
        status="Operating"
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)
    return location

@pytest.fixture
def location_in_maintenance(db_session):
    location = LocationCoordinate(
        location_name="Maintenance SMS",
        user_id="SMS-MAINT-01",
        type="consumer",
        x=300.0,
        y=400.0,
        is_visible=True,
        status="Operating"
    )
    db_session.add(location)
    db_session.commit()

    maintenance = MaintenanceSchedule(
        node_id="SMS-MAINT-01",
        start_date=date.today() - timedelta(days=1),
        end_date=date.today() + timedelta(days=1),
        reason="Scheduled maintenance"
    )
    db_session.add(maintenance)
    db_session.commit()
    db_session.refresh(location)
    return location

class TestGetLocations:

    def test_get_locations_success(self, client, sample_location):
        response = client.get("/api/locations")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(loc["location_name"] == "Test Blast Furnace" for loc in data)

    def test_get_locations_includes_maintenance_status(self, client, location_in_maintenance):
        response = client.get("/api/locations")
        assert response.status_code == 200
        data = response.json()

        maint_loc = next(
            (loc for loc in data if loc["user_id"] == "SMS-MAINT-01"),
            None
        )
        assert maint_loc is not None
        assert maint_loc["status"] == "Maintenance"

    def test_get_locations_empty(self, client):
        response = client.get("/api/locations")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

class TestGetLocationById:

    def test_get_location_by_user_id(self, client, sample_location):
        response = client.get(f"/api/locations/id/{sample_location.user_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == "BF-TEST-01"
        assert data["location_name"] == "Test Blast Furnace"

    def test_get_location_by_name(self, client, sample_location):
        response = client.get("/api/locations/id/Test Blast Furnace")
        assert response.status_code == 200
        data = response.json()
        assert data["location_name"] == "Test Blast Furnace"

    def test_get_location_not_found(self, client):
        response = client.get("/api/locations/id/NON-EXISTENT")
        assert response.status_code == 404

    def test_get_location_maintenance_status(self, client, location_in_maintenance):
        response = client.get(f"/api/locations/id/{location_in_maintenance.user_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Maintenance"

class TestGetLocationByName:

    def test_get_location_by_name_route(self, client, sample_location):
        response = client.get(f"/api/locations/name/{sample_location.location_name}")
        assert response.status_code == 200
        data = response.json()
        assert data["location_name"] == "Test Blast Furnace"

class TestCreateLocation:

    def test_create_location_success(self, client):
        response = client.post(
            "/api/locations",
            json={
                "location_name": "New Location",
                "user_id": "NEW-LOC-01",
                "type": "producer",
                "x": 150.0,
                "y": 250.0,
                "is_visible": True
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["location_name"] == "New Location"
        assert data["user_id"] == "NEW-LOC-01"
        assert data["x"] == 150.0
        assert data["y"] == 250.0

    def test_create_location_duplicate_name(self, client, sample_location):
        response = client.post(
            "/api/locations",
            json={'location_name': 'Test Blast Furnace', 'user_id': 'ANOTHER-ID', 'type': 'producer', 'x': 150.0, 'y': 250.0}
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_create_location_invalid_coordinates(self, client):
        response = client.post(
            "/api/locations",
            json={'location_name': 'Invalid Location', 'user_id': 'INVALID-01', 'type': 'producer', 'x': 'not-a-number', 'y': 250.0}
        )
        assert response.status_code == 400

    def test_create_location_minimal_data(self, client):
        response = client.post(
            "/api/locations",
            json={'location_name': 'Minimal Location', 'type': 'junction', 'x': 100.0, 'y': 100.0}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_visible"] == True

class TestUpdateLocation:

    def test_update_location_success(self, client, sample_location):
        response = client.put(
            f"/api/locations/{sample_location.id}",
            json={"x": 999.0, "y": 888.0}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["x"] == 999.0
        assert data["y"] == 888.0

    def test_update_location_name(self, client, sample_location):
        response = client.put(
            f"/api/locations/{sample_location.id}",
            json={"location_name": "Updated Name"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["location_name"] == "Updated Name"

    def test_update_location_visibility(self, client, sample_location):
        response = client.put(
            f"/api/locations/{sample_location.id}",
            json={"is_visible": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_visible"] == False

    def test_update_location_not_found(self, client):
        response = client.put(
            "/api/locations/99999",
            json={"x": 100.0}
        )
        assert response.status_code == 404
