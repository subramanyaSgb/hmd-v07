
class TestAccountLockout:

    def test_failed_login_increments_attempts(self, client, admin_user, db_session):
                              
        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "wrongpassword"}
        )
        assert response.status_code == 401
        assert "4 attempt(s) remaining" in response.json()["detail"]

        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "wrongpassword"}
        )
        assert response.status_code == 401
        assert "3 attempt(s) remaining" in response.json()["detail"]

    def test_account_locked_after_max_attempts(self, client, admin_user, db_session):
                                
        for i in range(5):
            response = client.post(
                "/api/auth/login",
                json={"username": "admin_test", "password": "wrongpassword"}
            )

        assert response.status_code == 403
        assert "Account has been locked" in response.json()["detail"]

    def test_locked_account_rejects_login(self, client, admin_user, db_session):
                          
        for _ in range(5):
            client.post(
                "/api/auth/login",
                json={"username": "admin_test", "password": "wrongpassword"}
            )

        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "admin123"}
        )
        assert response.status_code == 403
        assert "Account is locked" in response.json()["detail"]

    def test_successful_login_resets_attempts(self, client, admin_user, db_session):
                                
        for _ in range(3):
            client.post(
                "/api/auth/login",
                json={"username": "admin_test", "password": "wrongpassword"}
            )

        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "admin123"}
        )
        assert response.status_code == 200

        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "wrongpassword"}
        )
        assert "4 attempt(s) remaining" in response.json()["detail"]

class TestTokenBlacklist:

    def test_logout_invalidates_token(self, client, admin_user, db_session):
               
        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "admin123"}
        )
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 200

        response = client.post(
            "/api/auth/logout",
            headers=headers,
            json={"token": token}
        )
        assert response.status_code == 200
        assert "Token has been invalidated" in response.json()["message"]

        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 401

    def test_blacklisted_token_rejected(self, client, admin_user, db_session):
               
        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "admin123"}
        )
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        client.post("/api/auth/logout", headers=headers, json={"token": token})

        response = client.get("/api/trips", headers=headers)
        assert response.status_code == 401

        response = client.get("/api/fleet-management", headers=headers)
        assert response.status_code == 401

class TestLoginAttemptLogging:

    def test_successful_login_logged(self, client, admin_user, db_session):
        from backend.database.models import LoginAttempt

        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "admin123"}
        )
        assert response.status_code == 200

        attempts = db_session.query(LoginAttempt).filter(
            LoginAttempt.username == "admin_test",
            LoginAttempt.success == True
        ).all()
        assert len(attempts) == 1

    def test_failed_login_logged(self, client, admin_user, db_session):
        from backend.database.models import LoginAttempt

        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "wrongpassword"}
        )
        assert response.status_code == 401

        attempts = db_session.query(LoginAttempt).filter(
            LoginAttempt.username == "admin_test",
            LoginAttempt.success == False
        ).all()
        assert len(attempts) == 1
        assert attempts[0].failure_reason == "invalid_credentials"

class TestTokenRefresh:

    def test_refresh_token_success(self, client, admin_user, db_session):
               
        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "admin123"}
        )
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        response = client.post("/api/auth/refresh", headers=headers)
        assert response.status_code == 200
        assert "access_token" in response.json()
        assert response.json()["token_type"] == "bearer"

    def test_refresh_token_returns_new_token(self, client, admin_user, db_session):
               
        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "admin123"}
        )
        old_token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {old_token}"}

        response = client.post("/api/auth/refresh", headers=headers)
        new_token = response.json()["access_token"]

        assert new_token != old_token

class TestCurrentUser:

    def test_get_current_user(self, client, admin_user, db_session):
               
        response = client.post(
            "/api/auth/login",
            json={"username": "admin_test", "password": "admin123"}
        )
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "admin_test"
        assert data["role"] == "admin"

    def test_get_current_user_producer(self, client, producer_user, db_session):
               
        response = client.post(
            "/api/auth/login",
            json={"username": "producer_test", "password": "producer123"}
        )
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "producer_test"
        assert data["role"] == "producer"
        assert data["user_id"] == "BF001"
