
from backend.database.models import Trip, FleetManagement
from backend.constants import TripStatus

class TestTripList:

    def test_get_trips_empty(self, client, auth_headers):
        response = client.get("/api/trips", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []

    def test_get_trips_with_data(self, client, auth_headers, db_session):
                            
        trip = Trip(
            trip_id="TRIP001",
            producer_id="BF001",
            consumer_id="SMS001",
            status=TripStatus.PENDING
        )
        db_session.add(trip)
        db_session.commit()

        response = client.get("/api/trips", headers=auth_headers)
        assert response.status_code == 200
        trips = response.json()
        assert len(trips) == 1
        assert trips[0]["trip_id"] == "TRIP001"

    def test_get_trips_filter_by_status(self, client, auth_headers, db_session):
                                              
        trip1 = Trip(trip_id="TRIP001", producer_id="BF001", consumer_id="SMS001", status=0)
        trip2 = Trip(trip_id="TRIP002", producer_id="BF001", consumer_id="SMS001", status=1)
        db_session.add_all([trip1, trip2])
        db_session.commit()

        response = client.get("/api/trips?status=0", headers=auth_headers)
        assert response.status_code == 200
        trips = response.json()
        assert len(trips) == 1
        assert trips[0]["trip_id"] == "TRIP001"

class TestTripCreation:

    def test_create_trip_manual(self, client, auth_headers, db_session):
        response = client.post(
            "/api/trips/manual",
            headers=auth_headers,
            json={'producer_id': 'BF001', 'consumer_id': 'SMS001'}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
                                                                                 
        assert "trip_id" in data
        assert data["trip_id"].startswith("MT_")
        assert "BF001" in data["trip_id"]
        assert "SMS001" in data["trip_id"]

    def test_create_trip_multiple(self, client, auth_headers, db_session):
                           
        response1 = client.post(
            "/api/trips/manual",
            headers=auth_headers,
            json={"producer_id": "BF001", "consumer_id": "SMS001"}
        )
        assert response1.status_code == 200
        trip_id_1 = response1.json()["trip_id"]

        response2 = client.post(
            "/api/trips/manual",
            headers=auth_headers,
            json={"producer_id": "BF001", "consumer_id": "SMS001"}
        )
        assert response2.status_code == 200
        trip_id_2 = response2.json()["trip_id"]

        assert trip_id_1 != trip_id_2

class TestTripStatusUpdate:

    def test_update_trip_status(self, client, auth_headers, db_session):
                                                        
        trip = Trip(
            trip_id="TRIP001",
            producer_id="BF001",
            consumer_id="SMS001",
            torpedo_id="T001",
            status=TripStatus.ASSIGNED
        )
        db_session.add(trip)
        db_session.commit()

        response = client.post(
            "/api/trips/update-status",
            headers=auth_headers,
            json={"trip_id": trip.trip_id, "status": TripStatus.WB_TARE_ENTRY}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["trip_status"] == TripStatus.WB_TARE_ENTRY

    def test_invalid_status_transition(self, client, auth_headers, db_session):
                                                                                             
        trip = Trip(
            trip_id="TRIP001",
            producer_id="BF001",
            consumer_id="SMS001",
            torpedo_id="T001",
            status=TripStatus.ASSIGNED
        )
        db_session.add(trip)
        db_session.commit()

        response = client.post(
            "/api/trips/update-status",
            headers=auth_headers,
            json={"trip_id": trip.trip_id, "status": TripStatus.COMPLETED}
        )
        assert response.status_code == 400

class TestTripAssignment:

    def test_assign_torpedo(self, client, auth_headers, db_session):
                               
        trip = Trip(
            trip_id="TRIP001",
            producer_id="BF001",
            consumer_id="SMS001",
            status=TripStatus.PENDING
        )
                                     
        torpedo = FleetManagement(
            fleet_id="T001",
            type="Torpedo",
            status="Operating",
            capacity=300
        )
        db_session.add_all([trip, torpedo])
        db_session.commit()

        response = client.post(
            "/api/trips/assign",
            headers=auth_headers,
            json={"trip_id": "TRIP001", "torpedo_id": "T001"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["torpedo_id"] == "T001"

    def test_assign_unavailable_torpedo(self, client, auth_headers, db_session):
                               
        trip = Trip(
            trip_id="TRIP001",
            producer_id="BF001",
            consumer_id="SMS001",
            status=TripStatus.PENDING
        )
                                         
        torpedo = FleetManagement(
            fleet_id="T001",
            type="Torpedo",
            status="Maintenance",
            capacity=300
        )
        db_session.add_all([trip, torpedo])
        db_session.commit()

        response = client.post(
            "/api/trips/assign",
            headers=auth_headers,
            json={"trip_id": "TRIP001", "torpedo_id": "T001"}
        )
        assert response.status_code == 400

class TestTripDeletion:

    def test_delete_pending_trip(self, client, auth_headers, db_session):
        trip = Trip(
            trip_id="TRIP001",
            producer_id="BF001",
            consumer_id="SMS001",
            status=TripStatus.PENDING
        )
        db_session.add(trip)
        db_session.commit()

        response = client.delete(f"/api/trips/{trip.trip_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["status"] == "success"

    def test_delete_nonexistent_trip(self, client, auth_headers):
        response = client.delete("/api/trips/NONEXISTENT", headers=auth_headers)
        assert response.status_code == 404
