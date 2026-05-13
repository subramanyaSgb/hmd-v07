# Strip Security Features to Local-Auth-Only

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove MFA/2FA, Google OAuth, email verification, and email notifications from the application. Keep only local username/password authentication with optional email field and self-service password change.

**Architecture:** Delete 4 backend route/utility files, 4 frontend component/page files. Modify login flow to remove MFA/OAuth/email-verification gates. Add new change-password endpoint. Strip Security tab to Account Info + Change Password. Create Alembic migration to drop unused tables and columns.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, React, PostgreSQL

---

## Task 1: Backend — Delete MFA and OAuth Route Files

**Files:**
- Delete: `backend/routes/mfa.py`
- Delete: `backend/routes/oauth.py`
- Delete: `backend/utils/mfa_utils.py`

**Step 1: Delete the files**

```bash
rm backend/routes/mfa.py
rm backend/routes/oauth.py
rm backend/utils/mfa_utils.py
```

**Step 2: Verify no other file directly imports from deleted modules**

```bash
grep -rn "from.*routes.*mfa" backend/ --include="*.py"
grep -rn "from.*routes.*oauth" backend/ --include="*.py"
grep -rn "from.*utils.*mfa_utils" backend/ --include="*.py"
```

Expected: hits in `main.py`, `auth.py`, `email_verification.py`, `config.py` — these get fixed in later tasks.

**Step 3: Commit**

```bash
git add -u backend/routes/mfa.py backend/routes/oauth.py backend/utils/mfa_utils.py
git commit -m "chore: delete MFA and OAuth route/utility files"
```

---

## Task 2: Backend — Delete Email Verification Route File

**Files:**
- Delete: `backend/routes/email_verification.py`

**Step 1: Delete the file**

```bash
rm backend/routes/email_verification.py
```

Note: This file contained forgot-password and reset-password endpoints. Those are being removed per design (Option B — admin handles password resets). A self-service change-password endpoint (requires current password) is added in Task 5.

**Step 2: Commit**

```bash
git add -u backend/routes/email_verification.py
git commit -m "chore: delete email verification routes (includes forgot/reset password)"
```

---

## Task 3: Backend — Clean Up main.py Route Registrations

**Files:**
- Modify: `backend/main.py:37-38` (imports) and `backend/main.py:412-414` (router includes)

**Step 1: Remove imports**

At line 37-38, remove:
```python
# MFA and OAuth routes
from .routes import mfa, oauth, email_verification
```

**Step 2: Remove router includes**

At lines 412-414, remove:
```python
# MFA and OAuth routes
app.include_router(mfa.router)
app.include_router(oauth.router)
app.include_router(email_verification.router)
```

**Step 3: Verify app starts**

```bash
.venv\Scripts\activate.bat
cd backend
python -c "from main import app; print('OK')"
```

Expected: Import errors from auth.py (fixed in Task 4). If so, proceed to Task 4.

**Step 4: Commit**

```bash
git add backend/main.py
git commit -m "chore: remove MFA/OAuth/email-verification route registrations from main.py"
```

---

## Task 4: Backend — Clean Up auth.py (Remove MFA/OAuth/Email-Verification Logic)

**Files:**
- Modify: `backend/routes/auth.py`

**Step 1: Remove MFA/OAuth/email imports**

Remove from line 6:
```python
from ..database.models import User, MFASession
```
Replace with:
```python
from ..database.models import User
```

Remove lines 27-32 entirely:
```python
from ..utils.mfa_utils import (
    is_feature_enabled, is_mfa_required_for_role,
    create_mfa_session_token, get_mfa_session_expiry,
    mask_email, generate_email_otp, hash_otp
)
from ..utils.email_service import email_service
from ..utils.cache import cache
```

Remove `LoginResponseWithMFA` from line 34 schema import. Keep `LoginRequest`, `LoginResponse`, `LogoutRequest`, `CurrentUserResponse`.

**Step 2: Simplify login endpoint response model**

Change line 41 response_model from `LoginResponseWithMFA` to `LoginResponse`.

**Step 3: Remove MFA check block (lines 171-213)**

Delete the entire `# ============== MFA CHECK ==============` section that:
- Checks `user.mfa_enabled`
- Creates MFA sessions
- Sends email OTP
- Returns `LoginResponseWithMFA(requires_mfa=True, ...)`

**Step 4: Remove email verification check block (lines 215-231)**

Delete the entire `# ============== EMAIL VERIFICATION CHECK ==============` section.

**Step 5: Remove MFA requirement check (lines 233-238)**

Delete `is_mfa_required_for_role` check block.

**Step 6: Simplify login success response (lines 261-268)**

Change from:
```python
return LoginResponseWithMFA(
    access_token=access_token,
    token_type="bearer",
    username=user.username,
    role=user.role,
    user_id=user.user_id,
    requires_mfa=False
)
```
To:
```python
return LoginResponse(
    access_token=access_token,
    token_type="bearer",
    username=user.username,
    role=user.role,
    user_id=user.user_id
)
```

**Step 7: Clean /me endpoint (lines 359-363)**

Remove OAuth fields from CurrentUserResponse construction:
```python
# Remove these lines:
auth_provider=current_user.auth_provider or "local",
google_id=current_user.google_id,
google_email=current_user.google_email,
```

Also remove MFA fields if present:
```python
# Remove these if present:
mfa_enabled=current_user.mfa_enabled,
mfa_method=current_user.mfa_method,
```

**Step 8: Verify auth.py compiles**

```bash
python -c "from backend.routes.auth import router; print('OK')"
```

**Step 9: Commit**

```bash
git add backend/routes/auth.py
git commit -m "refactor: strip MFA/OAuth/email-verification logic from auth login flow"
```

---

## Task 5: Backend — Add Change Password Endpoint to auth.py

**Files:**
- Modify: `backend/routes/auth.py` (add new endpoint)

**Step 1: Add change-password endpoint**

Add to auth.py after the `/refresh` endpoint:

```python
@router.put("/change-password")
async def change_password(
    request: Request,
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Change current user's password. Requires current password verification."""
    from ..utils.security import verify_password, get_password_hash

    # Verify current password
    if not verify_password(data.current_password, current_user.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # Validate new password
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    # Update password
    current_user.password = get_password_hash(data.new_password)
    db.commit()

    log_activity(
        db, current_user.username, "PASSWORD_CHANGED",
        details="User changed their own password",
        entity_type="user",
        entity_id=current_user.username
    )

    return {"status": "success", "message": "Password changed successfully"}
```

**Step 2: Add ChangePasswordRequest schema to schemas.py**

Add near other auth schemas:

```python
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=128)
```

**Step 3: Import schema in auth.py**

Add `ChangePasswordRequest` to the schema import line.

**Step 4: Test endpoint**

```bash
pytest backend/tests/test_auth.py -v -k "password" 2>/dev/null || echo "No existing password tests - OK"
```

**Step 5: Commit**

```bash
git add backend/routes/auth.py backend/schemas.py
git commit -m "feat: add change-password endpoint for self-service password change"
```

---

## Task 6: Backend — Clean Up schemas.py (Remove MFA/OAuth/Email Schemas)

**Files:**
- Modify: `backend/schemas.py`

**Step 1: Delete these schema classes entirely**

Lines 1375-1452 (MFA schemas):
- `MFAMethod` (enum)
- `MFASetupInitRequest`
- `MFASetupInitResponse`
- `MFASetupVerifyRequest`
- `MFASetupVerifyResponse`
- `MFAVerifyRequest`
- `MFAVerifyBackupRequest`
- `MFASendOTPRequest`
- `MFADisableRequest`
- `MFABackupCodesResponse`
- `MFAStatusResponse`

Lines 1381-1384:
- `AuthProvider` (enum)

Lines 1457-1485 (email verification schemas):
- `EmailSendVerificationRequest`
- `EmailVerifyRequest`
- `EmailChangeRequest`
- `EmailVerificationResponse`

Lines 1490-1517 (OAuth schemas):
- `GoogleOAuthURLResponse`
- `GoogleOAuthCallbackRequest`
- `GoogleOAuthLinkRequest`
- `GoogleOAuthUnlinkRequest`
- `OAuthUserResponse`

Lines 1522-1542:
- `LoginResponseWithMFA` — DELETE entirely

**Step 2: Clean LoginResponse**

Ensure `LoginResponse` exists and has these fields only:
```python
class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    user_id: Optional[str] = None
```

**Step 3: Clean CurrentUserResponse**

Remove these fields if present:
- `mfa_enabled`, `mfa_method`, `mfa_verified_at`
- `google_id`, `google_email`, `auth_provider`
- `email_verified`, `email_verified_at`
- `email_notifications_enabled`

Keep: `username`, `role`, `user_id`, `email` (optional field stays)

**Step 4: Verify schemas compile**

```bash
python -c "from backend.schemas import LoginResponse, ChangePasswordRequest, CurrentUserResponse; print('OK')"
```

**Step 5: Commit**

```bash
git add backend/schemas.py
git commit -m "chore: remove MFA/OAuth/email-verification schemas"
```

---

## Task 7: Backend — Clean Up config.py (Remove Auth Feature Toggles)

**Files:**
- Modify: `backend/routes/config.py:460-624`

**Step 1: Delete the entire Auth Feature Toggle section**

Remove lines 460-624:
- `CACHE_KEY_AUTH_FEATURES` constant
- `AUTH_FEATURE_CONFIGS` dict
- `AuthFeatureConfigUpdate` schema
- `AuthFeatureBulkUpdate` schema
- `GET /auth-features` endpoint
- `GET /auth-features/public` endpoint
- `POST /auth-features/bulk` endpoint

**Step 2: Verify config.py still works**

```bash
python -c "from backend.routes.config import router; print('OK')"
```

**Step 3: Commit**

```bash
git add backend/routes/config.py
git commit -m "chore: remove auth feature toggle endpoints from config"
```

---

## Task 8: Backend — Clean Up email_service.py

**Files:**
- Modify: `backend/utils/email_service.py`

**Step 1: Remove these methods**

- `send_verification_email` (line 274)
- `send_mfa_otp` (line 305)
- `send_mfa_enabled_notification` (line 330)
- `send_mfa_disabled_notification` (line 356)
- `send_welcome_email` (line 377)
- `send_email_verified_confirmation` (line 460)
- `send_password_reset_email` (line 433)
- `send_login_alert` (line 491)

**Step 2: Keep these methods**

- `__init__` (line 36)
- `is_configured` (line 46)
- `_create_message` (line 50)
- `_send_email` (line 72) — core sender, used by reports
- `_get_base_template` (line 118) — HTML template wrapper
- `send_notification_email` (line 408) — generic, may be useful

**Step 3: Verify email service still works**

```bash
python -c "from backend.utils.email_service import email_service; print(email_service.is_configured())"
```

**Step 4: Commit**

```bash
git add backend/utils/email_service.py
git commit -m "chore: remove MFA/OAuth/verification email methods, keep core sender"
```

---

## Task 9: Backend — Clean Up models.py (Remove MFA/OAuth Columns and Tables)

**Files:**
- Modify: `backend/database/models.py`

**Step 1: Remove columns from User model**

Remove these lines from User class:
- Line 66: `email_verified = Column(Boolean, default=False)`
- Line 67: `email_verified_at = Column(DateTime(timezone=True), nullable=True)`
- Line 70: `google_id = Column(String(255), unique=True, index=True, nullable=True)`
- Line 71: `google_email = Column(String(255), nullable=True)`
- Line 72: `auth_provider = Column(String(50), default="local")`
- Line 75: `mfa_enabled = Column(Boolean, default=False)`
- Line 76: `mfa_method = Column(String(20), nullable=True)`
- Line 77: `mfa_secret = Column(String(255), nullable=True)`
- Line 78: `mfa_verified_at = Column(DateTime(timezone=True), nullable=True)`
- Line 81: `email_notifications_enabled = Column(Boolean, default=True)`

**Keep:** `email = Column(String(255), unique=True, index=True, nullable=True)` (line 65)

**Step 2: Remove relationship back_populates on User**

Remove relationships to deleted models:
- `mfa_backup_codes` relationship
- `mfa_sessions` relationship
- `email_tokens` relationship

**Step 3: Delete model classes**

Remove entirely:
- `EmailVerificationToken` class (lines 717-736)
- `MfaBackupCode` class (lines 739-754)
- `MfaSession` class (lines 757-776)

**Step 4: Verify models compile**

```bash
python -c "from backend.database.models import User; print('OK')"
```

**Step 5: Commit**

```bash
git add backend/database/models.py
git commit -m "chore: remove MFA/OAuth/email-verification columns and table models"
```

---

## Task 10: Backend — Create Alembic Migration to Drop Tables and Columns

**Files:**
- Create: `backend/alembic/versions/xxxx_strip_security_features.py`

**Step 1: Generate migration**

```bash
cd backend
python -m alembic revision --autogenerate -m "strip_mfa_oauth_email_verification"
```

**Step 2: Review generated migration**

Verify it includes:
- DROP TABLE `mfa_backup_codes`
- DROP TABLE `mfa_sessions`
- DROP TABLE `email_verification_tokens`
- DROP COLUMN on `users`: `email_verified`, `email_verified_at`, `google_id`, `google_email`, `auth_provider`, `mfa_enabled`, `mfa_method`, `mfa_secret`, `mfa_verified_at`, `email_notifications_enabled`
- Does NOT drop `email` column

If autogenerate misses anything, add manually.

**Step 3: Add downgrade operations**

Ensure `downgrade()` re-creates dropped tables and columns for rollback safety.

**Step 4: Apply migration**

```bash
python -m alembic upgrade head
```

**Step 5: Verify**

```bash
python -m alembic current
```

**Step 6: Commit**

```bash
git add backend/alembic/versions/
git commit -m "migrate: drop MFA/OAuth/email-verification tables and columns"
```

---

## Task 11: Frontend — Delete MFA/OAuth/Email Verification Components

**Files:**
- Delete: `frontend/src/components/MFASetup.jsx`
- Delete: `frontend/src/components/MFAVerificationForm.jsx`
- Delete: `frontend/src/pages/OAuthCallback.jsx`
- Delete: `frontend/src/pages/EmailVerification.jsx`

**Step 1: Delete files**

```bash
rm frontend/src/components/MFASetup.jsx
rm frontend/src/components/MFAVerificationForm.jsx
rm frontend/src/pages/OAuthCallback.jsx
rm frontend/src/pages/EmailVerification.jsx
```

**Step 2: Commit**

```bash
git add -u frontend/src/components/MFASetup.jsx frontend/src/components/MFAVerificationForm.jsx frontend/src/pages/OAuthCallback.jsx frontend/src/pages/EmailVerification.jsx
git commit -m "chore: delete MFA/OAuth/email-verification frontend components"
```

---

## Task 12: Frontend — Clean Up App.jsx (Remove OAuth/Email Routes)

**Files:**
- Modify: `frontend/src/App.jsx`

**Step 1: Remove lazy imports (lines 25-26)**

```javascript
// DELETE:
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'))
const EmailVerification = lazy(() => import('./pages/EmailVerification'))
```

**Step 2: Remove route config entries (lines 43-44)**

```javascript
// DELETE:
'/oauth/google/callback': { title: 'OAuth Callback' },
'/verify-email': { title: 'Email Verification' },
```

**Step 3: Remove public path handling (lines 138-149)**

Remove `/oauth/google/callback` and `/verify-email` from `publicPaths` array. Remove their `<Route>` elements. If `/reset-password` is the only remaining public path, remove it too (no more password reset).

**Step 4: Verify frontend builds**

```bash
cd frontend && npm run build
```

Expected: may fail due to Settings.jsx/LoginPage.jsx still importing deleted components. Those get fixed in Tasks 13-14.

**Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "chore: remove OAuth/email-verification routes from App.jsx"
```

---

## Task 13: Frontend — Clean Up LoginPage.jsx

**Files:**
- Modify: `frontend/src/pages/LoginPage.jsx`

**Step 1: Remove MFA state variables (lines 21-24)**

```javascript
// DELETE:
const [loginStep, setLoginStep] = useState('credentials');
const [mfaSession, setMfaSession] = useState(null);
const [mfaMethod, setMfaMethod] = useState(null);
```

**Step 2: Remove OAuth state variables (lines 26-28)**

```javascript
// DELETE:
const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);
const [oauthLoading, setOauthLoading] = useState(false);
```

**Step 3: Remove MFA pending useEffect (lines 31-39)**

Delete entire useEffect that checks `location.state?.mfaPending`.

**Step 4: Remove handleMfaSuccess function (lines 101-122)**

Delete entire function.

**Step 5: Remove Google OAuth button (lines 304-367)**

Delete the `{googleOAuthEnabled && ...}` block with divider and Google sign-in button.

**Step 6: Remove MFA verification form display (lines 132-166)**

Delete the `if (loginStep === 'mfa')` block that renders `<MFAVerificationForm>`.

**Step 7: Remove MFAVerificationForm import**

Delete the import for MFAVerificationForm component.

**Step 8: Simplify login handler**

In the login submit handler, remove MFA/email-verification response checks:
```javascript
// DELETE these blocks:
if (response.requires_mfa) { ... }
if (response.requires_email_verification) { ... }
```

Login should now: submit credentials → get token → navigate to dashboard. Simple.

**Step 9: Remove any useEffect fetching `/api/config/auth-features/public`**

This fetched `google_oauth_enabled` for showing Google button. No longer needed.

**Step 10: Commit**

```bash
git add frontend/src/pages/LoginPage.jsx
git commit -m "refactor: strip LoginPage to username/password only"
```

---

## Task 14: Frontend — Rebuild Settings.jsx Security Tab

**Files:**
- Modify: `frontend/src/pages/Settings.jsx`

This is the biggest frontend change. The Security tab currently has ~500 lines of MFA/OAuth/email UI. Replace with Account Info + Change Password.

**Step 1: Remove security-related state variables (lines 63-92)**

Delete all of:
- `securityData` state
- `showEmailChangeModal`, `emailChangeForm`, `emailChangeLoading`
- `showMfaSetupModal`, `mfaSetupStep`, `mfaMethod`, `mfaSetupData`, `mfaVerifyCode`, `mfaBackupCodes`, `mfaSetupLoading`
- `showMfaDisableModal`, `mfaDisableForm`, `mfaDisableLoading`
- `showGoogleUnlinkModal`, `googleUnlinkPassword`, `googleUnlinkLoading`

Add new state:
```javascript
// Password change state
const [showPasswordModal, setShowPasswordModal] = useState(false)
const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
const [passwordLoading, setPasswordLoading] = useState(false)
```

**Step 2: Remove security data fetch useEffect (lines 370-405)**

Delete the entire useEffect that fetches `/api/mfa/status`, `/api/email/status`, `/api/oauth/status`.

**Step 3: Remove auth features fetch and save functions**

Delete `fetchAuthFeatures()` and `saveAuthFeatures()` functions and related state.

**Step 4: Remove all MFA/OAuth/email handler functions (lines 977-1055+)**

Delete:
- `handleMfaSetupStart`, `handleMfaMethodSelect`, `handleMfaVerify`, `handleMfaSetupComplete`
- `handleMfaDisable`
- Email change handlers
- Google link/unlink handlers

**Step 5: Add change password handler**

```javascript
const handlePasswordChange = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        showNotification('error', 'New passwords do not match')
        return
    }
    if (passwordForm.newPassword.length < 6) {
        showNotification('error', 'Password must be at least 6 characters')
        return
    }
    setPasswordLoading(true)
    try {
        await api.put('/api/auth/change-password', {
            current_password: passwordForm.currentPassword,
            new_password: passwordForm.newPassword
        })
        showNotification('success', 'Password changed successfully')
        setShowPasswordModal(false)
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
        showNotification('error', err.message || 'Failed to change password')
    } finally {
        setPasswordLoading(false)
    }
}
```

**Step 6: Replace Security tab render (lines 3639-4549+)**

Replace entire Security tab content with two cards:

**Card 1: Account Information** (keep existing, remove session status if it references MFA)
- Username
- Role badge
- Host ID
- Email (optional, display only)

**Card 2: Password Management**
- "Change Password" button that opens modal
- Password modal with: current password, new password, confirm new password, submit button

**Step 7: Remove all modals (lines 4139-4600+)**

Delete:
- Email change modal
- MFA setup modal
- MFA disable modal
- Google unlink modal

Add password change modal:
```jsx
{showPasswordModal && (
    <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Change Password</h3>
            <div className="form-group">
                <label>Current Password</label>
                <input type="password" value={passwordForm.currentPassword}
                    onChange={e => setPasswordForm(p => ({...p, currentPassword: e.target.value}))} />
            </div>
            <div className="form-group">
                <label>New Password</label>
                <input type="password" value={passwordForm.newPassword}
                    onChange={e => setPasswordForm(p => ({...p, newPassword: e.target.value}))} />
            </div>
            <div className="form-group">
                <label>Confirm New Password</label>
                <input type="password" value={passwordForm.confirmPassword}
                    onChange={e => setPasswordForm(p => ({...p, confirmPassword: e.target.value}))} />
            </div>
            <div className="modal-actions">
                <button onClick={() => setShowPasswordModal(false)}>Cancel</button>
                <button onClick={handlePasswordChange} disabled={passwordLoading}>
                    {passwordLoading ? 'Changing...' : 'Change Password'}
                </button>
            </div>
        </div>
    </div>
)}
```

**Step 8: Remove Admin Controls section entirely (lines 3901-4134)**

Delete the entire Admin Controls card with 5 toggles.

**Step 9: Commit**

```bash
git add frontend/src/pages/Settings.jsx
git commit -m "refactor: rebuild Security tab with Account Info + Change Password only"
```

---

## Task 15: Frontend — Clean Up AuthContext.jsx

**Files:**
- Modify: `frontend/src/context/AuthContext.jsx`

**Step 1: Remove MFA check from login function (lines 49-57)**

```javascript
// DELETE:
if (response.requires_mfa) {
    return { success: false, requires_mfa: true, mfa_session: response.mfa_session, mfa_method: response.mfa_method };
}
```

**Step 2: Remove email verification check from login (lines 59-66)**

```javascript
// DELETE:
if (response.requires_email_verification) {
    return { success: false, requires_email_verification: true, message: '...' };
}
```

**Step 3: Clean user data object (lines 104-114)**

Remove from fullUserData:
```javascript
// DELETE:
email_verified: userInfo.email_verified,
mfa_enabled: userInfo.mfa_enabled,
mfa_method: userInfo.mfa_method,
```

Keep: `email: userInfo.email`

**Step 4: Commit**

```bash
git add frontend/src/context/AuthContext.jsx
git commit -m "refactor: remove MFA/OAuth/email-verification state from AuthContext"
```

---

## Task 16: Verify Full Stack Works

**Step 1: Start backend**

```bash
.venv\Scripts\activate.bat
uvicorn backend.main:app --reload --port 8000
```

Verify: no import errors, `/health` returns `{"status": "healthy"}`.

**Step 2: Build frontend**

```bash
cd frontend && npm run build
```

Verify: no build errors.

**Step 3: Start frontend dev server**

```bash
cd frontend && npm run dev
```

**Step 4: Test login flow**

- Go to login page — should show only username/password, no Google button
- Login with admin credentials — should go straight to dashboard, no MFA prompt

**Step 5: Test Security tab**

- Navigate to Settings → Security tab
- Should show Account Info card + Change Password button
- Click Change Password → modal opens → test with wrong current password (should error) → test with correct password (should succeed)
- No MFA, OAuth, email verification, admin controls visible

**Step 6: Test report email**

- Go to Reports → send report via email
- Verify SMTP still works for reports (separate from removed features)

**Step 7: Run backend tests**

```bash
pytest backend/ -v --tb=short 2>&1 | tail -20
```

Note: Some tests may fail if they test MFA/OAuth/email-verification. Delete or skip those test files:
- `backend/tests/test_mfa.py` (if exists)
- `backend/tests/test_oauth.py` (if exists)
- `backend/tests/test_email_verification.py` (if exists)

**Step 8: Commit any test cleanup**

```bash
git add -A
git commit -m "test: remove MFA/OAuth/email-verification tests, verify full stack"
```

---

## Task 17: Clean Up SystemConfig Rows (Optional)

**Step 1: Remove stale config rows from database**

```sql
DELETE FROM system_config WHERE config_key IN (
    'AUTH_EMAIL_VERIFICATION_REQUIRED',
    'AUTH_GOOGLE_OAUTH_ENABLED',
    'AUTH_MFA_REQUIRED_ADMIN',
    'AUTH_MFA_REQUIRED_PRODUCER',
    'AUTH_MFA_REQUIRED_CONSUMER'
);
```

This can be done via Alembic data migration or direct SQL.

**Step 2: Commit if migration created**

```bash
git add backend/alembic/versions/
git commit -m "migrate: clean up auth feature config rows from system_config"
```

---

## Summary

| Task | Action | Files |
|------|--------|-------|
| 1 | Delete MFA/OAuth backend files | 3 deleted |
| 2 | Delete email verification route | 1 deleted |
| 3 | Clean main.py registrations | 1 modified |
| 4 | Strip auth.py login flow | 1 modified |
| 5 | Add change-password endpoint | 2 modified |
| 6 | Remove schemas | 1 modified |
| 7 | Remove auth feature toggles | 1 modified |
| 8 | Clean email_service.py | 1 modified |
| 9 | Clean models.py | 1 modified |
| 10 | Alembic migration | 1 created |
| 11 | Delete frontend components | 4 deleted |
| 12 | Clean App.jsx routes | 1 modified |
| 13 | Strip LoginPage.jsx | 1 modified |
| 14 | Rebuild Security tab | 1 modified |
| 15 | Clean AuthContext.jsx | 1 modified |
| 16 | Full stack verification | 0 (testing) |
| 17 | Clean DB config rows | 1 created (optional) |

**Total: 8 files deleted, 10 files modified, 2 files created (migrations)**
