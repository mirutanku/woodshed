import os
import resend
from dotenv import load_dotenv

load_dotenv()

resend.api_key = os.getenv("RESEND_API_KEY")

FROM_EMAIL = os.getenv("FROM_EMAIL", "Woodshed <noreply@woodshed.fm>")


def send_password_reset_email(to_email: str, reset_link: str):
    """Send a password reset email via Resend."""
    resend.Emails.send({
        "from": FROM_EMAIL,
        "to": [to_email],
        "subject": "Reset your Woodshed password",
        "html": f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #1a1a1a; margin-bottom: 24px;">Reset your password</h2>
            <p style="color: #444; line-height: 1.6;">
                We received a request to reset your Woodshed password. Click the button below to choose a new one.
            </p>
            <a href="{reset_link}"
               style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 500; margin: 24px 0;">
                Reset Password
            </a>
            <p style="color: #888; font-size: 14px; line-height: 1.6;">
                This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="color: #aaa; font-size: 12px;">Woodshed — Practice smarter.</p>
        </div>
        """,
    })
