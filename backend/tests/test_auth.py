
class TestLogin:

    def test_login_success(self, client, admin_user):
        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["username"] == "admin_test"
        assert data["role"] == "admin"

    def test_login_invalid_password(self, client, admin_user):
        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "wrongpassword"}
        )
        assert response.status_code == 401
        assert "Invalid credentials" in response.json()["detail"]

    def test_login_invalid_username(self, client):
        response = client.post(
            "/api/auth/login",
            json={"username": "nonexistent", "password": "password123"}
        )
        assert response.status_code == 401

    def test_login_missing_fields(self, client):
        response = client.post("/api/auth/login", json={})
        assert response.status_code == 422

class TestProtectedEndpoints:

    def test_access_without_token(self, client):
        response = client.get("/api/trips")
        assert response.status_code == 401

    def test_access_with_invalid_token(self, client):
        response = client.get(
            "/api/trips",
            headers={"Authorization": "Bearer invalid_token"}
        )
        assert response.status_code == 401

    def test_access_with_valid_token(self, client, auth_headers):
        response = client.get("/api/trips", headers=auth_headers)
        assert response.status_code == 200

class TestRoleBasedAccess:

    def test_admin_can_access_admin_routes(self, client, auth_headers):
        response = client.get("/api/fleet-management", headers=auth_headers)
        assert response.status_code == 200

    def test_producer_cannot_access_admin_routes(self, client, producer_headers):
                                        
        response = client.post(
            "/api/fleet-management",
            headers=producer_headers,
            json={"fleet_id": "T001", "type": "Torpedo", "capacity": 300}
        )
        assert response.status_code == 403
