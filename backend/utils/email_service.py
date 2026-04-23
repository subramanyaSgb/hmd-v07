import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from typing import Optional
from datetime import datetime

from ..logger import logger

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "HMD System")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").lower() in ("true", "1", "yes")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

class EmailService:

    def __init__(self):
        self.smtp_host = SMTP_HOST
        self.smtp_port = SMTP_PORT
        self.smtp_user = SMTP_USER
        self.smtp_password = SMTP_PASSWORD
        self.from_email = SMTP_FROM_EMAIL or SMTP_USER
        self.from_name = SMTP_FROM_NAME
        self.use_tls = SMTP_USE_TLS
        self.use_ssl = SMTP_USE_SSL

    def is_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

    def _create_message(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> MIMEMultipart:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = formataddr((self.from_name, self.from_email))
        msg['To'] = to_email

        if text_content:
            msg.attach(MIMEText(text_content, 'plain', 'utf-8'))

        msg.attach(MIMEText(html_content, 'html', 'utf-8'))

        return msg

    def _send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        if not self.is_configured():
            logger.warning("Email service not configured. Skipping email send.")
            return False

        try:
            msg = self._create_message(to_email, subject, html_content, text_content)

            if self.use_ssl:
                server = smtplib.SMTP_SSL(self.smtp_host, self.smtp_port)
            else:
                server = smtplib.SMTP(self.smtp_host, self.smtp_port)
                if self.use_tls:
                    server.starttls()

            server.login(self.smtp_user, self.smtp_password)
            server.send_message(msg)
            server.quit()

            logger.info(f"Email sent successfully to {to_email}")
            return True

        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed: {e}")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email to {to_email}: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending email to {to_email}: {e}")
            return False

    def _get_base_template(self, content: str, title: str = "HMD System") -> str:
        return f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }}
        .header {{
            background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
            color: white;
            padding: 28px 24px;
            text-align: center;
        }}
        .header-logo {{
            font-size: 28px;
            font-weight: 800;
            letter-spacing: 2px;
            margin-bottom: 6px;
        }}
        .header-subtitle {{
            font-size: 12px;
            color: #94a3b8;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }}
        .content {{
            padding: 32px;
        }}
        .content h2 {{
            color: #0f172a;
            margin-top: 0;
        }}
        .button {{
            display: inline-block;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white !important;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 8px;
            font-weight: 600;
            margin: 20px 0;
        }}
        .button:hover {{
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        }}
        .code-box {{
            background: #f8fafc;
            border: 2px dashed #cbd5e1;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
        }}
        .code {{
            font-family: 'Courier New', monospace;
            font-size: 32px;
            font-weight: bold;
            color: #0f172a;
            letter-spacing: 4px;
        }}
        .footer {{
            background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
            padding: 28px 20px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
        }}
        .footer-logo {{
            font-size: 18px;
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 8px;
            letter-spacing: 0.5px;
        }}
        .footer-tagline {{
            font-size: 11px;
            color: #64748b;
            margin-bottom: 16px;
            letter-spacing: 0.3px;
        }}
        .footer-divider {{
            width: 60px;
            height: 2px;
            background: linear-gradient(90deg, #3b82f6, #06b6d4);
            margin: 16px auto;
            border-radius: 1px;
        }}
        .footer-copyright {{
            font-size: 11px;
            color: #94a3b8;
            margin-top: 12px;
        }}
        .warning {{
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px;
            margin: 16px 0;
            border-radius: 4px;
        }}
        .info {{
            background: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 12px;
            margin: 16px 0;
            border-radius: 4px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-logo">DEEVIA</div>
            <div class="header-subtitle">Hot Metal Distribution System</div>
        </div>
        <div class="content">
            {content}
        </div>
        <div class="footer">
            <div class="footer-logo">DEEVIA</div>
            <div class="footer-tagline">Advanced Logistics Control & Operational Intelligence System</div>
            <div class="footer-divider"></div>
            <p>This is an automated message from the HMD System.</p>
            <p>Please do not reply to this email.</p>
            <p class="footer-copyright">&copy; {datetime.now().year} Deevia Software India Pvt Ltd. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
"""

    def send_notification_email(
        self,
        to_email: str,
        username: str,
        sender: str,
        message: str
    ) -> bool:
        content = f"""
            <h2>New Notification</h2>
            <p>Hello <strong>{username}</strong>,</p>
            <p>You have a new notification from <strong>{sender}</strong>:</p>
            <div class="info">
                <p>{message}</p>
            </div>
            <p style="text-align: center;">
                <a href="{FRONTEND_URL}" class="button">View in HMD System</a>
            </p>
        """

        html = self._get_base_template(content, "New Notification")
        text = f"Hello {username}, You have a new notification from {sender}: {message}"

        return self._send_email(to_email, f"HMD System Notification from {sender}", html, text)

email_service = EmailService()
