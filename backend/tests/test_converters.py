import pytest
from backend.database.models import Converter, ConverterStatusHistory

@pytest.fixture
def sample_converter(db_session, consumer_user):
    from datetime import datetime, timezone

    converter = Converter(
        consumer_id="SMS001",
        name="BOF-1",
        capacity_tons=150.0,
        max_heats=3000,
        current_heats=500,
        status="Running",
        status_since=datetime.now(timezone.utc),
    )
    db_session.add(converter)
    db_session.flush()

    history = ConverterStatusHistory(
        converter_id=converter.id,
        old_status=None,
        new_status="Running",
        changed_by="consumer_test",
        changed_by_role="consumer",
        reason="Converter created",
        heats_at_change=0,
    )
    db_session.add(history)
    db_session.commit()
    db_session.refresh(converter)
    return converter

@pytest.fixture
def maintenance_converter(db_session, consumer_user):
    from datetime import datetime, timezone

    converter = Converter(
        consumer_id="SMS001",
        name="BOF-2",
        capacity_tons=200.0,
        max_heats=3000,
        current_heats=2800,
        status="Maintenance",
        status_since=datetime.now(timezone.utc),
    )
    db_session.add(converter)
    db_session.flush()

    history = ConverterStatusHistory(
        converter_id=converter.id,
        old_status=None,
        new_status="Maintenance",
        changed_by="consumer_test",
        changed_by_role="consumer",
        reason="Converter created in maintenance",
        heats_at_change=2800,
    )
    db_session.add(history)
    db_session.commit()
    db_session.refresh(converter)
    return converter

class TestCreateConverter:

    def test_create_converter_success(self, client, consumer_headers, consumer_user):
        response = client.post(
            "/api/converters/SMS001",
            json={'name': 'BOF-1', 'capacity_tons': 150.0, 'max_heats': 3000},
            headers=consumer_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "BOF-1"
        assert data["consumer_id"] == "SMS001"
        assert data["capacity_tons"] == 150.0
        assert data["max_heats"] == 3000
        assert data["current_heats"] == 0
        assert data["status"] == "Running"
        assert "lining_percentage" in data
        assert data["lining_percentage"] == 100.0

    def test_create_converter_admin(self, client, auth_headers, consumer_user):
        response = client.post(
            "/api/converters/SMS001",
            json={"name": "BOF-Admin", "capacity_tons": 200.0},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "BOF-Admin"
        assert data["consumer_id"] == "SMS001"

    def test_create_converter_unauthenticated(self, client):
        response = client.post(
            "/api/converters/SMS001",
            json={"name": "BOF-1", "capacity_tons": 150.0},
        )
        assert response.status_code == 401

    def test_create_converter_missing_name(self, client, consumer_headers, consumer_user):
        response = client.post(
            "/api/converters/SMS001",
            json={"capacity_tons": 150.0},
            headers=consumer_headers,
        )
        assert response.status_code == 400
        assert "name" in response.json()["detail"].lower()

    def test_create_duplicate_converter(self, client, consumer_headers, sample_converter):
        response = client.post(
            "/api/converters/SMS001",
            json={'name': 'BOF-1', 'capacity_tons': 200.0, 'max_heats': 2500},
            headers=consumer_headers,
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

class TestGetConverters:

    def test_get_converters_returns_list(self, client, sample_converter):
        response = client.get("/api/converters/SMS001")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

        converter = data[0]
        assert converter["name"] == "BOF-1"
        assert converter["consumer_id"] == "SMS001"
        assert "lining_percentage" in converter
        assert "lining_level" in converter
        assert "status_days" in converter

    def test_get_converters_empty(self, client):
        response = client.get("/api/converters/SMS999")
        assert response.status_code == 200
        assert response.json() == []

    def test_get_converters_excludes_deleted(self, client, db_session, sample_converter):
        sample_converter.soft_delete()
        db_session.commit()

        response = client.get("/api/converters/SMS001")
        assert response.status_code == 200
        assert len(response.json()) == 0

    def test_get_converters_lining_info(self, client, sample_converter):
                                                             
        response = client.get("/api/converters/SMS001")
        data = response.json()
        converter = data[0]
        assert converter["lining_percentage"] == 83.3
        assert converter["lining_level"] == "good"         

class TestUpdateConverter:

    def test_update_converter_success(self, client, consumer_headers, sample_converter):
        response = client.put(
            f"/api/converters/{sample_converter.id}",
            json={'name': 'BOF-1-Updated', 'capacity_tons': 180.0, 'max_heats': 3500},
            headers=consumer_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "BOF-1-Updated"
        assert data["capacity_tons"] == 180.0
        assert data["max_heats"] == 3500

    def test_update_converter_unauthenticated(self, client, sample_converter):
        response = client.put(
            f"/api/converters/{sample_converter.id}",
            json={"name": "BOF-Updated"},
        )
        assert response.status_code == 401

    def test_update_converter_not_found(self, client, auth_headers):
        response = client.put(
            "/api/converters/99999",
            json={"name": "BOF-X"},
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_update_converter_admin(self, client, auth_headers, sample_converter):
        response = client.put(
            f"/api/converters/{sample_converter.id}",
            json={"capacity_tons": 999.0},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["capacity_tons"] == 999.0

class TestUpdateConverterStatus:

    def test_update_status_running_to_maintenance(self, client, consumer_headers, sample_converter):
        response = client.put(
            f"/api/converters/{sample_converter.id}/status",
            json={"status": "Maintenance", "reason": "Scheduled relining"},
            headers=consumer_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Maintenance"

    def test_maintenance_to_running_resets_heats(self, client, consumer_headers, maintenance_converter):
        response = client.put(
            f"/api/converters/{maintenance_converter.id}/status",
            json={"status": "Running", "reason": "Relining complete"},
            headers=consumer_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Running"
        assert data["current_heats"] == 0
                                                   
        assert data["lining_percentage"] == 100.0

    def test_invalid_status_rejected(self, client, consumer_headers, sample_converter):
        response = client.put(
            f"/api/converters/{sample_converter.id}/status",
            json={"status": "InvalidStatus"},
            headers=consumer_headers,
        )
        assert response.status_code == 400
        assert "Invalid status" in response.json()["detail"]

    def test_same_status_no_change(self, client, consumer_headers, sample_converter):
        response = client.put(
            f"/api/converters/{sample_converter.id}/status",
            json={"status": "Running"},
            headers=consumer_headers,
        )
        assert response.status_code == 200
        assert response.json()["status"] == "Running"

    def test_update_status_unauthenticated(self, client, sample_converter):
        response = client.put(
            f"/api/converters/{sample_converter.id}/status",
            json={"status": "Maintenance"},
        )
        assert response.status_code == 401

    def test_update_status_not_found(self, client, auth_headers):
        response = client.put(
            "/api/converters/99999/status",
            json={"status": "Maintenance"},
            headers=auth_headers,
        )
        assert response.status_code == 404

class TestDeleteConverter:

    def test_soft_delete_converter(self, client, consumer_headers, sample_converter, db_session):
        converter_id = sample_converter.id

        response = client.delete(
            f"/api/converters/{converter_id}",
            headers=consumer_headers,
        )
        assert response.status_code == 200
        assert "deleted" in response.json()["message"].lower()

        db_session.expire_all()
        item = db_session.query(Converter).filter(Converter.id == converter_id).first()
        assert item is not None
        assert item.deleted_at is not None

    def test_delete_converter_unauthenticated(self, client, sample_converter):
        response = client.delete(f"/api/converters/{sample_converter.id}")
        assert response.status_code == 401

    def test_delete_converter_not_found(self, client, auth_headers):
        response = client.delete(
            "/api/converters/99999",
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_delete_converter_admin(self, client, auth_headers, sample_converter):
        response = client.delete(
            f"/api/converters/{sample_converter.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200

class TestConverterHistory:

    def test_get_history_with_timeline_and_summary(self, client, sample_converter):
        response = client.get(f"/api/converters/{sample_converter.id}/history")
        assert response.status_code == 200
        data = response.json()

        assert "converter" in data
        assert data["converter"]["name"] == "BOF-1"

        assert "timeline" in data
        assert isinstance(data["timeline"], list)
        assert len(data["timeline"]) >= 1

        entry = data["timeline"][0]
        assert "old_status" in entry
        assert "new_status" in entry
        assert "changed_by" in entry
        assert "duration_hours" in entry

        assert "summary" in data
        summary = data["summary"]
        assert "running_hours" in summary
        assert "maintenance_hours" in summary
        assert "shutdown_hours" in summary
        assert "standby_hours" in summary
        assert "availability_pct" in summary

    def test_get_history_not_found(self, client):
        response = client.get("/api/converters/99999/history")
        assert response.status_code == 404

class TestGanttData:

    def test_get_gantt_data(self, client, sample_converter):
        response = client.get("/api/converters/gantt/SMS001")
        assert response.status_code == 200
        data = response.json()

        assert isinstance(data, list)
        assert len(data) >= 1

        gantt_item = data[0]
        assert "converter_id" in gantt_item
        assert "converter_name" in gantt_item
        assert "current_status" in gantt_item
        assert "segments" in gantt_item
        assert isinstance(gantt_item["segments"], list)

        if gantt_item["segments"]:
            segment = gantt_item["segments"][0]
            assert "status" in segment
            assert "start" in segment
            assert "end" in segment
            assert "duration_hours" in segment

    def test_get_gantt_data_empty(self, client):
        response = client.get("/api/converters/gantt/SMS999")
        assert response.status_code == 200
        assert response.json() == []

class TestConverterStats:

    def test_get_stats(self, client, sample_converter):
        response = client.get("/api/converters/stats/SMS001")
        assert response.status_code == 200
        data = response.json()

        assert data["consumer_id"] == "SMS001"
        assert data["total_converters"] == 1
        assert data["active_converters"] == 1                            
        assert "avg_lining_pct" in data
        assert "converters_needing_relining" in data

    def test_get_stats_empty_consumer(self, client):
        response = client.get("/api/converters/stats/SMS999")
        assert response.status_code == 200
        data = response.json()
        assert data["total_converters"] == 0
        assert data["active_converters"] == 0
        assert data["avg_lining_pct"] == 0
        assert data["converters_needing_relining"] == 0

    def test_get_stats_with_critical_lining(self, client, db_session, consumer_user):
        from datetime import datetime, timezone

        converter = Converter(
            consumer_id="SMS001",
            name="BOF-Critical",
            capacity_tons=150.0,
            max_heats=1000,
            current_heats=900,                                    
            status="Running",
            status_since=datetime.now(timezone.utc),
        )
        db_session.add(converter)
        db_session.commit()

        response = client.get("/api/converters/stats/SMS001")
        data = response.json()
        assert data["converters_needing_relining"] >= 1

class TestAdminGetAllConverters:

    def test_admin_get_all(self, client, auth_headers, sample_converter):
        response = client.get(
            "/api/converters/admin/all",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(c["name"] == "BOF-1" for c in data)

    def test_admin_get_all_unauthenticated(self, client):
        response = client.get("/api/converters/admin/all")
        assert response.status_code == 401

    def test_admin_get_all_non_admin(self, client, consumer_headers):
        response = client.get(
            "/api/converters/admin/all",
            headers=consumer_headers,
        )
        assert response.status_code == 403
