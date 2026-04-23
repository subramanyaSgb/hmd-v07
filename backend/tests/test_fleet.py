from backend.database.models import FleetManagement

class TestGetFleetManagement:

    def test_get_fleet_unauthenticated(self, client):
        response = client.get("/api/fleet-management")
        assert response.status_code == 401

    def test_get_fleet_authenticated(self, client, auth_headers, fleet_torpedo):
        response = client.get("/api/fleet-management", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(t["fleet_id"] == "TLC-TEST-01" for t in data)

    def test_get_fleet_excludes_soft_deleted(self, client, auth_headers, db_session):
                                          
        from datetime import datetime, timezone

        torpedo = FleetManagement(
            fleet_id="TLC-DELETED-01",
            type="torpedo",
            status="Operating",
            capacity=360.0,
            deleted_at=datetime.now(timezone.utc)
        )
        db_session.add(torpedo)
        db_session.commit()

        response = client.get("/api/fleet-management", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert not any(t["fleet_id"] == "TLC-DELETED-01" for t in data)

class TestCreateFleetManagement:

    def test_create_fleet_unauthenticated(self, client):
        response = client.post(
            "/api/fleet-management",
            json={"fleet_id": "TLC-NEW-01", "type": "torpedo", "capacity": 360.0}
        )
        assert response.status_code == 401

    def test_create_fleet_non_admin(self, client, producer_headers):
        response = client.post(
            "/api/fleet-management",
            json={"fleet_id": "TLC-NEW-01", "type": "torpedo", "capacity": 360.0},
            headers=producer_headers
        )
        assert response.status_code == 403

    def test_create_fleet_success(self, client, auth_headers):
        response = client.post(
            "/api/fleet-management",
            json={"fleet_id": "TLC-NEW-01", "type": "torpedo", "capacity": 360.0},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["fleet_id"] == "TLC-NEW-01"
        assert data["type"] == "torpedo"
        assert data["status"] == "Operating"
        assert data["capacity"] == 360.0

    def test_create_fleet_duplicate(self, client, auth_headers, fleet_torpedo):
        response = client.post(
            "/api/fleet-management",
            json={"fleet_id": "TLC-TEST-01", "type": "torpedo", "capacity": 360.0},
            headers=auth_headers
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_create_fleet_with_status(self, client, auth_headers):
        response = client.post(
            "/api/fleet-management",
            json={'fleet_id': 'TLC-MAINT-01', 'type': 'torpedo', 'capacity': 360.0, 'status': 'Maintenance'},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Maintenance"

class TestUpdateFleetManagement:

    def test_update_fleet_unauthenticated(self, client, fleet_torpedo):
        response = client.put(
            f"/api/fleet-management/{fleet_torpedo.id}",
            json={"status": "Maintenance"}
        )
        assert response.status_code == 401

    def test_update_fleet_non_admin(self, client, producer_headers, fleet_torpedo):
        response = client.put(
            f"/api/fleet-management/{fleet_torpedo.id}",
            json={"status": "Maintenance"},
            headers=producer_headers
        )
        assert response.status_code == 403

    def test_update_fleet_success(self, client, auth_headers, fleet_torpedo):
        response = client.put(
            f"/api/fleet-management/{fleet_torpedo.id}",
            json={"status": "Maintenance"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Maintenance"

    def test_update_fleet_not_found(self, client, auth_headers):
        response = client.put(
            "/api/fleet-management/99999",
            json={"status": "Maintenance"},
            headers=auth_headers
        )
        assert response.status_code == 404

    def test_update_fleet_capacity(self, client, auth_headers, fleet_torpedo):
        response = client.put(
            f"/api/fleet-management/{fleet_torpedo.id}",
            json={"capacity": 400.0},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["capacity"] == 400.0

class TestDeleteFleetManagement:

    def test_delete_fleet_unauthenticated(self, client, fleet_torpedo):
        response = client.delete(f"/api/fleet-management/{fleet_torpedo.id}")
        assert response.status_code == 401

    def test_delete_fleet_non_admin(self, client, producer_headers, fleet_torpedo):
        response = client.delete(
            f"/api/fleet-management/{fleet_torpedo.id}",
            headers=producer_headers
        )
        assert response.status_code == 403

    def test_delete_fleet_success(self, client, auth_headers, fleet_torpedo, db_session):
        fleet_id = fleet_torpedo.id

        response = client.delete(
            f"/api/fleet-management/{fleet_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        assert "decommissioned" in response.json()["message"].lower()

        db_session.expire_all()
        item = db_session.query(FleetManagement).filter(
            FleetManagement.id == fleet_id
        ).first()
        assert item is not None
        assert item.deleted_at is not None

    def test_delete_fleet_not_found(self, client, auth_headers):
        response = client.delete(
            "/api/fleet-management/99999",
            headers=auth_headers
        )
        assert response.status_code == 404

    def test_delete_already_deleted(self, client, auth_headers, db_session):
        from datetime import datetime, timezone

        torpedo = FleetManagement(
            fleet_id="TLC-TO-DELETE",
            type="torpedo",
            status="Operating",
            capacity=360.0,
            deleted_at=datetime.now(timezone.utc)
        )
        db_session.add(torpedo)
        db_session.commit()
        item_id = torpedo.id

        response = client.delete(
            f"/api/fleet-management/{item_id}",
            headers=auth_headers
        )
        assert response.status_code == 404
