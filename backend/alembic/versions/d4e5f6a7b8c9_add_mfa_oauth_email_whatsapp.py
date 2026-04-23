from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None

def upgrade() -> None:
                                                  
    op.add_column('users', sa.Column('email', sa.String(255), nullable=True))
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

    op.create_index('ix_users_email', 'users', ['email'], unique=True)
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

    op.create_table(
        'whatsapp_group_mappings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('group_jid', sa.String(), nullable=True),
        sa.Column('group_name', sa.String(), nullable=True),
        sa.Column('mapping_type', sa.String(), nullable=True),
        sa.Column('node_id', sa.String(), nullable=True),
        sa.Column('language_code', sa.String(), server_default='en', nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('notifications_enabled', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('notify_trip_assigned', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('notify_trip_started', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('notify_trip_completed', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('notify_deviations', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('notify_daily_report', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('last_updated', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_whatsapp_group_mappings_id', 'whatsapp_group_mappings', ['id'])
    op.create_index('ix_whatsapp_group_mappings_group_jid', 'whatsapp_group_mappings', ['group_jid'])
    op.create_index('ix_whatsapp_group_mappings_mapping_type', 'whatsapp_group_mappings', ['mapping_type'])
    op.create_index('ix_whatsapp_group_mappings_node_id', 'whatsapp_group_mappings', ['node_id'])
    op.create_index('idx_whatsapp_group_type_node', 'whatsapp_group_mappings', ['mapping_type', 'node_id'])

    op.create_table(
        'whatsapp_message_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('recipient_type', sa.String(), nullable=True),
        sa.Column('recipient_id', sa.String(), nullable=True),
        sa.Column('recipient_name', sa.String(), nullable=True),
        sa.Column('message_type', sa.String(), nullable=True),
        sa.Column('message_content', sa.String(), nullable=True),
        sa.Column('language_code', sa.String(), server_default='en', nullable=True),
        sa.Column('related_entity_type', sa.String(), nullable=True),
        sa.Column('related_entity_id', sa.String(), nullable=True),
        sa.Column('status', sa.String(), server_default='pending', nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_whatsapp_message_logs_id', 'whatsapp_message_logs', ['id'])
    op.create_index('ix_whatsapp_message_logs_recipient_type', 'whatsapp_message_logs', ['recipient_type'])
    op.create_index('ix_whatsapp_message_logs_recipient_id', 'whatsapp_message_logs', ['recipient_id'])
    op.create_index('ix_whatsapp_message_logs_message_type', 'whatsapp_message_logs', ['message_type'])
    op.create_index('ix_whatsapp_message_logs_status', 'whatsapp_message_logs', ['status'])
    op.create_index('ix_whatsapp_message_logs_created_at', 'whatsapp_message_logs', ['created_at'])
    op.create_index('idx_whatsapp_log_status_created', 'whatsapp_message_logs', ['status', 'created_at'])

def downgrade() -> None:
                          
    op.drop_table('whatsapp_message_logs')
    op.drop_table('whatsapp_group_mappings')

    op.drop_table('mfa_sessions')
    op.drop_table('mfa_backup_codes')

    op.drop_table('email_verification_tokens')

    op.drop_index('ix_users_google_id', table_name='users')
    op.drop_index('ix_users_email', table_name='users')

    op.drop_column('users', 'email_notifications_enabled')
    op.drop_column('users', 'mfa_verified_at')
    op.drop_column('users', 'mfa_secret')
    op.drop_column('users', 'mfa_method')
    op.drop_column('users', 'mfa_enabled')
    op.drop_column('users', 'auth_provider')
    op.drop_column('users', 'google_email')
    op.drop_column('users', 'google_id')
    op.drop_column('users', 'email_verified_at')
    op.drop_column('users', 'email_verified')
    op.drop_column('users', 'email')
