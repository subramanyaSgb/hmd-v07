
class TestHealthCheck:

    def test_health_endpoint(self, client):
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

class TestSystemStats:

    def test_system_stats_authenticated(self, client, auth_headers):
        response = client.get("/api/system/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "backend" in data
        assert "cpu" in data
        assert "memory" in data
        assert data["backend"] == "online"
