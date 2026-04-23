import { useState, useEffect } from 'react';
import { api } from '../utils/api';

function generateCastId(tripId, producerId, consumerId) {
  const prodNum = (producerId || '').replace(/\D/g, '') || '1';
  const consNum = (consumerId || '').replace(/\D/g, '') || '1';
  const parts = (tripId || '').split('_');
  const seq = parts[parts.length - 1] || '001';
  return `CIB${prodNum}S${consNum}${seq}`;
}

export default function WeighbridgeModal({ isOpen, onClose, onSubmit, tripId, torpedoId, recordType, producerId, consumerId }) {
  const [weighbridges, setWeighbridges] = useState([]);
  const [formData, setFormData] = useState({
    weighbridge_id: '',
    weight_kg: '',
    cast_id: '',
    furnace_id: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchWeighbridges();
      setFormData({
        weighbridge_id: '',
        weight_kg: '',
        cast_id: generateCastId(tripId, producerId, consumerId),
        furnace_id: producerId || '',
      });
      setError('');
    }
  }, [isOpen, tripId, producerId, consumerId]);

  const fetchWeighbridges = async () => {
    try {
      const res = await api.get('/api/weighbridges?status=Operating');
      if (res.success) {
        setWeighbridges(res.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch weighbridges:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.weight_kg || parseFloat(formData.weight_kg) <= 0) {
      setError('Weight is required and must be greater than 0');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const submitData = {
        weighbridge_id: formData.weighbridge_id ? parseInt(formData.weighbridge_id) : null,
        weight_kg: parseFloat(formData.weight_kg),
        cast_id: formData.cast_id || null,
        furnace_id: formData.furnace_id || null,
      };

      await onSubmit(submitData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to submit weighbridge data');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isTare = recordType === 'tare';
  const title = isTare ? 'Record Tare Weight (Empty)' : 'Record Gross Weight (Full)';
  const accentColor = isTare ? '#f59e0b' : '#22c55e';

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, background: '#ffffff', color: '#1e293b', }} onClick={e => e.stopPropagation()}>
        <div style={{ ...styles.header, borderBottom: `3px solid ${accentColor}` }}>
          <div>
            <h2 style={{ ...styles.title, color: '#0f172a'}}>{title}</h2>
            <div style={styles.subtitle}>
              <span style={styles.badge}>Trip: {tripId}</span>
              <span style={styles.badge}>Torpedo: {torpedoId}</span>
              <span style={styles.badge}>{producerId} → {consumerId}</span>
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={{ ...styles.label, color: '#64748b'}}>
              Weighbridge
            </label>
            <select name="weighbridge_id" value={formData.weighbridge_id} onChange={handleChange} style={{ ...styles.input, background: '#f8fafc', color: '#1e293b', borderColor: '#e2e8f0', }}>
              <option value="">Select weighbridge...</option>
              {weighbridges.map(wb => (
                <option key={wb.id} value={wb.id}>{wb.name} - {wb.location_name || wb.name}</option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={{ ...styles.label, color: '#64748b'}}>
              Weight (kg) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input type="number" name="weight_kg" value={formData.weight_kg} onChange={handleChange} placeholder="Enter weight in kg" step="0.1" min="0" required style={{ ...styles.input, background: '#f8fafc', color: '#1e293b', borderColor: '#e2e8f0', }} />
          </div>
          <div style={styles.field}>
            <label style={{ ...styles.label, color: '#64748b'}}>
              Cast ID
              <span style={styles.autoTag}>auto-filled</span>
            </label>
            <input type="text" name="cast_id" value={formData.cast_id} onChange={handleChange} placeholder="Enter cast ID" style={{ ...styles.input, background: '#f8fafc', color: '#1e293b', borderColor: '#e2e8f0', }} />
          </div>
          <div style={styles.field}>
            <label style={{ ...styles.label, color: '#64748b'}}>
              Furnace ID
              <span style={styles.autoTag}>auto-filled</span>
            </label>
            <input type="text" name="furnace_id" value={formData.furnace_id} onChange={handleChange} placeholder="Enter furnace ID (e.g., BF-1)" style={{ ...styles.input, background: '#f8fafc', color: '#1e293b', borderColor: '#e2e8f0', }} />
          </div>
          {error && (
            <div style={styles.error}>{error}</div>
          )}
          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={{ ...styles.cancelBtn, background: '#f1f5f9', color: '#475569', }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ ...styles.submitBtn, background: accentColor }}>
              {loading ? 'Submitting...' : `Record ${isTare ? 'Tare' : 'Gross'} Weight`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    borderRadius: '16px',
    width: '480px',
    maxWidth: '95vw',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
  },
  header: {
    padding: '20px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
  },
  subtitle: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
    flexWrap: 'wrap',
  },
  badge: {
    fontSize: '12px',
    padding: '2px 8px',
    borderRadius: '4px',
    background: 'rgba(99,102,241,0.1)',
    color: '#6366f1',
    fontWeight: 500,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '4px',
  },
  form: {
    padding: '0 24px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  autoTag: {
    fontSize: '10px',
    fontWeight: 500,
    textTransform: 'none',
    letterSpacing: '0',
    padding: '1px 6px',
    borderRadius: '4px',
    background: 'rgba(99,102,241,0.1)',
    color: '#6366f1',
  },
  input: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  error: {
    padding: '10px 14px',
    borderRadius: '8px',
    background: 'rgba(239,68,68,0.1)',
    color: '#ef4444',
    fontSize: '13px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '8px',
  },
  cancelBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '10px 24px',
    borderRadius: '8px',
    border: 'none',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
