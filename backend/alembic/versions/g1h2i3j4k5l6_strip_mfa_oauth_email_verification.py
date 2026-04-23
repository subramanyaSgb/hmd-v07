from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = 'g1h2i3j4k5l6'
down_revision = 'f1g2h3i4j5k6'
branch_labels = None
depends_on = None

def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    existing_tables = insp.get_table_names()
    existing_columns = [col['name'] for col in insp.get_columns('users')]
    existing_indexes = [idx['name'] for idx in insp.get_indexes('users')]

    for table in ['mfa_sessions', 'mfa_backup_codes', 'email_verification_tokens']:
        if table in existing_tables:
            op.drop_table(table)

    if 'ix_users_google_id' in existing_indexes:
        op.drop_index('ix_users_google_id', table_name='users')

    columns_to_drop = [
        'email_notifications_enabled', 'mfa_verified_at', 'mfa_secret',
        'mfa_method', 'mfa_enabled', 'auth_provider', 'google_email',
        'google_id', 'email_verified_at', 'email_verified'
    ]
    for col in columns_to_drop:
        if col in existing_columns:
            op.drop_column('users', col)

def downgrade() -> None:
                                                  
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))

    op.add_column('users', sa.Column('google_id', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('google_email', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('auth_provider', sa.String(50), nullable=True, server_default='local'))

    op.add_column('users', sa.Column('mfa_enabled', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('users', sa.Column('mfa_method', sa.String(20), nullable=True))
    op.add_column('users', sa.Column('mfa_secret', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('mfa_verified_at', sa.DateTime(timezone=True), nullable=True))

    op.add_column('users', sa.Column('email_notifications_enabled', sa.Boolean(), nullable=True, server_default='true'))

    op.create_index('ix_users_google_id', 'users', ['google_id'], unique=True)

    op.create_table(
        'email_verification_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('token_hash', sa.String(255), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('token_type', sa.String(50), nullable=True),
        sa.Column('otp_code', sa.String(10), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_email_verification_tokens_id', 'email_verification_tokens', ['id'])
    op.create_index('ix_email_verification_tokens_user_id', 'email_verification_tokens', ['user_id'])
    op.create_index('ix_email_verification_tokens_token_hash', 'email_verification_tokens', ['token_hash'], unique=True)
    op.create_index('idx_email_token_user_type', 'email_verification_tokens', ['user_id', 'token_type'])

    op.create_table(
        'mfa_backup_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('code_hash', sa.String(255), nullable=True),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_mfa_backup_codes_id', 'mfa_backup_codes', ['id'])
    op.create_index('ix_mfa_backup_codes_user_id', 'mfa_backup_codes', ['user_id'])
    op.create_index('idx_mfa_backup_user_unused', 'mfa_backup_codes', ['user_id', 'used_at'])

    op.create_table(
        'mfa_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('session_token', sa.String(255), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('attempts', sa.Integer(), server_default='0', nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_mfa_sessions_id', 'mfa_sessions', ['id'])
    op.create_index('ix_mfa_sessions_user_id', 'mfa_sessions', ['user_id'])
    op.create_index('ix_mfa_sessions_session_token', 'mfa_sessions', ['session_token'], unique=True)
    op.create_index('idx_mfa_session_expires', 'mfa_sessions', ['expires_at'])
