import pytest
from datetime import date, timedelta
from backend.database.models import MaintenanceSchedule

@pytest.fixture
def sample_maintenance(db_session):
    schedule = MaintenanceSchedule(
        node_id="BF-TEST-01",
        start_date=date.today() + timedelta(days=7),
        end_date=date.today() + timedelta(days=14),
        reason="Annual maintenance"
    )
    db_session.add(schedule)
    db_session.commit()
    db_session.refresh(schedule)
    return schedule

@pytest.fixture
def active_maintenance(db_session):
    schedule = MaintenanceSchedule(
        node_id="SMS-ACTIVE-01",
        start_date=date.today() - timedelta(days=1),
        end_date=date.today() + timedelta(days=5),
        reason="Emergency repair"
    )
    db_session.add(schedule)
    db_session.commit()
    db_session.refresh(schedule)
    return schedule

class TestGetMaintenanceSchedules:

    def test_get_all_schedules(self, client, auth_headers, sample_maintenance):
        response = client.get("/api/maintenance", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(s["node_id"] == "BF-TEST-01" for s in data)

    def test_get_schedules_by_node(self, client, auth_headers, sample_maintenance, db_session):
                                                    
        other = MaintenanceSchedule(
            node_id="SMS-OTHER-01",
            start_date=date.today() + timedelta(days=20),
            end_date=date.today() + timedelta(days=25),
            reason="Other maintenance"
        )
        db_session.add(other)
        db_session.commit()

        response = client.get("/api/maintenance?node_id=BF-TEST-01", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert all(s["node_id"] == "BF-TEST-01" for s in data)

    def test_get_active_schedules_only(self, client, auth_headers, sample_maintenance, active_maintenance):
        response = client.get("/api/maintenance?active_only=true", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert any(s["node_id"] == "SMS-ACTIVE-01" for s in data)
                                                
        assert not any(s["node_id"] == "BF-TEST-01" for s in data)

    def test_get_schedules_empty(self, client, auth_headers):
        response = client.get("/api/maintenance", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

class TestGetMaintenanceCalendar:

    def test_get_calendar_current_month(self, client, auth_headers, active_maintenance):
        today = date.today()
        response = client.get(f"/api/maintenance/calendar/{today.year}/{today.month}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert any(s["node_id"] == "SMS-ACTIVE-01" for s in data)

    def test_get_calendar_future_month(self, client, auth_headers, sample_maintenance):
        future_date = date.today() + timedelta(days=10)
        response = client.get(f"/api/maintenance/calendar/{future_date.year}/{future_date.month}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
                                                       
        assert len(data) >= 1

    def test_get_calendar_empty_month(self, client, auth_headers, db_session):
                                                     
        old = MaintenanceSchedule(
            node_id="OLD-NODE",
            start_date=date(2020, 1, 1),
            end_date=date(2020, 1, 15),
            reason="Old maintenance"
        )
        db_session.add(old)
        db_session.commit()

        response = client.get("/api/maintenance/calendar/2025/6", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
                                              
        assert not any(s["node_id"] == "OLD-NODE" for s in data)

class TestCreateMaintenanceSchedule:

    def test_create_schedule_success(self, client, auth_headers):
        future_start = (date.today() + timedelta(days=30)).isoformat()
        future_end = (date.today() + timedelta(days=35)).isoformat()

        response = client.post(
            "/api/maintenance",
            headers=auth_headers,
            json={'node_id': 'NEW-NODE-01', 'start_date': future_start, 'end_date': future_end, 'reason': 'New scheduled maintenance'}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["node_id"] == "NEW-NODE-01"
        assert data["start_date"] == future_start
        assert data["end_date"] == future_end
        assert data["reason"] == "New scheduled maintenance"

    def test_create_schedule_missing_fields(self, client, auth_headers):
        response = client.post(
            "/api/maintenance",
            headers=auth_headers,
            json={"node_id": "INCOMPLETE-01"}
        )
        assert response.status_code == 400
        assert "Missing required fields" in response.json()["detail"]

    def test_create_schedule_end_before_start(self, client, auth_headers):
        response = client.post(
            "/api/maintenance",
            headers=auth_headers,
            json={
                "node_id": "INVALID-01",
                "start_date": (date.today() + timedelta(days=10)).isoformat(),
                "end_date": (date.today() + timedelta(days=5)).isoformat(),
                "reason": "Invalid dates"
            }
        )
        assert response.status_code == 400
        assert "End date must be after start date" in response.json()["detail"]

    def test_create_schedule_overlapping(self, client, auth_headers, sample_maintenance):
                                                          
        response = client.post(
            "/api/maintenance",
            headers=auth_headers,
            json={
                "node_id": "BF-TEST-01",
                "start_date": (date.today() + timedelta(days=10)).isoformat(),
                "end_date": (date.today() + timedelta(days=20)).isoformat(),
                "reason": "Overlapping maintenance"
            }
        )
        assert response.status_code == 400
        assert "Overlapping" in response.json()["detail"]

    def test_create_schedule_same_dates_different_node(self, client, auth_headers, sample_maintenance):
        response = client.post(
            "/api/maintenance",
            headers=auth_headers,
            json={
                "node_id": "DIFFERENT-NODE-01",
                "start_date": (date.today() + timedelta(days=7)).isoformat(),
                "end_date": (date.today() + timedelta(days=14)).isoformat(),
                "reason": "Different node maintenance"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["node_id"] == "DIFFERENT-NODE-01"

    def test_create_schedule_invalid_date_format(self, client, auth_headers):
        response = client.post(
            "/api/maintenance",
            headers=auth_headers,
            json={'node_id': 'INVALID-DATE-01', 'start_date': 'not-a-date', 'end_date': '2025-01-15', 'reason': 'Invalid date format'}
        )
        assert response.status_code == 400

class TestUpdateMaintenanceSchedule:

    def test_update_schedule_success(self, client, auth_headers, sample_maintenance):
        new_end = (date.today() + timedelta(days=21)).isoformat()
        response = client.put(
            f"/api/maintenance/{sample_maintenance.id}",
            headers=auth_headers,
            json={"end_date": new_end, "reason": "Extended maintenance"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["end_date"] == new_end
        assert data["reason"] == "Extended maintenance"

    def test_update_schedule_not_found(self, client, auth_headers):
        response = client.put(
            "/api/maintenance/99999",
            headers=auth_headers,
            json={"reason": "Updated reason"}
        )
        assert response.status_code == 404

    def test_update_schedule_invalid_dates(self, client, auth_headers, sample_maintenance):
        response = client.put(
            f"/api/maintenance/{sample_maintenance.id}",
            headers=auth_headers,
            json={
                "start_date": (date.today() + timedelta(days=20)).isoformat(),
                "end_date": (date.today() + timedelta(days=10)).isoformat()
            }
        )
        assert response.status_code == 400
        assert "End date must be after start date" in response.json()["detail"]

    def test_update_schedule_partial(self, client, auth_headers, sample_maintenance):
        response = client.put(
            f"/api/maintenance/{sample_maintenance.id}",
            headers=auth_headers,
            json={"reason": "Only reason updated"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["reason"] == "Only reason updated"
                                            
        assert data["node_id"] == "BF-TEST-01"

class TestDeleteMaintenanceSchedule:

    def test_delete_schedule_success(self, client, auth_headers, sample_maintenance, db_session):
        schedule_id = sample_maintenance.id

        response = client.delete(f"/api/maintenance/{schedule_id}", headers=auth_headers)
        assert response.status_code == 200
        assert "deleted" in response.json()["message"].lower()

        db_session.expire_all()
        deleted = db_session.query(MaintenanceSchedule).filter(
            MaintenanceSchedule.id == schedule_id
        ).first()
        assert deleted is None

    def test_delete_schedule_not_found(self, client, auth_headers):
        response = client.delete("/api/maintenance/99999", headers=auth_headers)
        assert response.status_code == 404
