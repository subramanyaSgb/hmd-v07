import { api, BASE_URL } from './api';

const REPORTS_API = {
    _buildQueryString(params = {}) {
        const filtered = Object.fromEntries(
            Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')
        );
        return new URLSearchParams(filtered).toString();
    },

    _getAuthToken() {
        try {
            const userData = sessionStorage.getItem('hmd_user');
            if (userData) {
                const user = JSON.parse(userData);
                return user.access_token;
            }
        } catch (e) {
            console.error('Error reading auth token:', e);
        }
        return null;
    },

    async getTripPerformanceReport(params = {}) {
        const queryString = this._buildQueryString(params);
        return api.get(`/api/reports/trip-performance?${queryString}`);
    },

    async getFleetUtilizationReport(params = {}) {
        const queryString = this._buildQueryString(params);
        return api.get(`/api/reports/fleet-utilization?${queryString}`);
    },

    async saveReport(reportData) {
        return api.post('/api/reports/saved', reportData);
    },

    async getSavedReports() {
        return api.get('/api/reports/saved');
    },

    async deleteSavedReport(reportId) {
        return api.delete(`/api/reports/saved/${reportId}`);
    },

    async createSchedule(scheduleData) {
        return api.post('/api/reports/schedules', scheduleData);
    },

    async getSchedules() {
        return api.get('/api/reports/schedules');
    },

    async deleteSchedule(scheduleId) {
        return api.delete(`/api/reports/schedules/${scheduleId}`);
    },

    async exportToCSV(reportType, params = {}) {
        const queryString = this._buildQueryString(params);
        const response = await fetch(`${BASE_URL}/api/reports/export/csv/${reportType}?${queryString}`, {
            headers: {
                'Authorization': `Bearer ${this._getAuthToken()}`
            }
        });
        if (!response.ok) throw new Error('Export failed');
        return response.blob();
    },

    async exportToJSON(reportType, params = {}) {
        const queryString = this._buildQueryString(params);
        const response = await fetch(`${BASE_URL}/api/reports/export/json/${reportType}?${queryString}`, {
            headers: {
                'Authorization': `Bearer ${this._getAuthToken()}`
            }
        });
        if (!response.ok) throw new Error('Export failed');
        return response.blob();
    },

    async exportToHTML(reportType, params = {}) {
        const queryString = this._buildQueryString(params);
        const response = await fetch(`${BASE_URL}/api/reports/export/html/${reportType}?${queryString}`, {
            headers: {
                'Authorization': `Bearer ${this._getAuthToken()}`
            }
        });
        if (!response.ok) throw new Error('Export failed');
        return response.blob();
    },

    async sendReportToEmail({ report_type, email, filters = {} }) {
        return api.post('/api/reports/send-email', {
            report_type,
            email,
            filters
        });
    }
};

export default REPORTS_API;
