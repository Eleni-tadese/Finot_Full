import logging
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags
import datetime

from .base import NotificationChannel

logger = logging.getLogger(__name__)


def _get_donation_details(payment_obj):
    """
    Helper to extract recipient email, name, and fund category from a Payment object.
    Handles both StudentDonation (reverse accessor: student_donation)
    and NonStudentDonation (reverse accessor: guest_donation).
    """
    email = None
    name = None
    category = None

    if hasattr(payment_obj, "student_donation") and payment_obj.student_donation:
        email = payment_obj.student_donation.student.email
        name = payment_obj.student_donation.student.first_name
        category = payment_obj.student_donation.get_fund_category_display()
    elif hasattr(payment_obj, "guest_donation") and payment_obj.guest_donation:
        email = payment_obj.guest_donation.email
        name = payment_obj.guest_donation.first_name
        category = payment_obj.guest_donation.get_fund_category_display()

    return email, name, category


def _send_html_email(subject, recipient_list, template_name=None, context=None, message_body=None, connection=None):
    """
    Central utility to send HTML emails.
    Can accept either a template_name + context OR a simple message_body string.
    """
    if not isinstance(recipient_list, list):
        recipient_list = [recipient_list]

    if template_name:
        html_message = render_to_string(template_name, context)
        plain_message = strip_tags(html_message)
    else:
        logo_url = getattr(settings, "FINOT_LOGO_URL", "")
        logo_html = (
            f'<img src="{logo_url}" alt="Finot Logo" style="height: 60px; object-fit: contain; display: inline-block;">'
            if logo_url
            else '<span style="color: #ffffff; font-size: 24px; font-weight: bold;">Finot</span>'
        )
        current_year = datetime.date.today().year

        html_message = f"""
        <html>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 0;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);">
                    <!-- Header with Blue background and Logo -->
                    <div style="background-color: #1e3a8a; padding: 25px; text-align: center;">
                        {logo_html}
                    </div>
                    
                    <!-- Main Content Body -->
                    <div style="padding: 30px; color: #374151; line-height: 1.6; font-size: 16px;">
                        <h2 style="color: #1e3a8a; margin-top: 0;">Finot Notification</h2>
                        {message_body}
                    </div>
                    
                    <!-- Footer with Yellow accent -->
                    <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 4px solid #fbbf24;">
                        <p style="font-size: 13px; color: #6b7280; margin: 0;">&copy; {current_year} Finot Platform. All rights reserved.</p>
                        <p style="font-size: 12px; color: #9ca3af; margin-top: 5px;">This is an automated message, please do not reply.</p>
                    </div>
                </div>
            </body>
        </html>
        """
        plain_message = message_body

    try:
        send_mail(
            subject=subject,
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipient_list,
            html_message=html_message,
            fail_silently=False,
            connection=connection,
        )
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", recipient_list, e, exc_info=True)
        return False


class EmailChannel(NotificationChannel):
    """
    Sends transactional emails for payment and event notifications.
    Logic extracted from core/emails.py.
    """

    def on_payment_completed(self, payment):
        email, name, category = _get_donation_details(payment)
        if not email:
            return

        subject = "Thank You for Your Donation - Receipt"
        amount = f"{payment.amount} {payment.currency}"
        tx_ref = payment.transaction_reference

        message_body = f"""
        <p style="font-size: 16px;">Dear <strong>{name or "Supporter"}</strong>,</p>
        <p>We have successfully received your generous donation. Thank you for your support!</p>
        
        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h3 style="color: #166534; margin-top: 0;">Donation Receipt</h3>
            <p style="margin: 5px 0;"><strong>Amount:</strong> <span style="color: #1e3a8a;">{amount}</span></p>
            <p style="margin: 5px 0;"><strong>Category:</strong> {category}</p>
            <p style="margin: 5px 0;"><strong>Transaction Ref:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 14px;">{tx_ref}</span></p>
        </div>
        
        <p>May God bless you!</p>
        """
        _send_html_email(subject, [email], message_body=message_body)

    def on_payment_failed(self, payment):
        email, name, category = _get_donation_details(payment)
        if not email:
            return

        subject = "Action Required: Donation Payment Failed"
        amount = f"{payment.amount} {payment.currency}"
        tx_ref = payment.transaction_reference
        frontend_url = getattr(settings, "FRONTEND_URL", "")

        message_body = f"""
        <p style="font-size: 16px;">Dear <strong>{name or "Supporter"}</strong>,</p>
        <p>Unfortunately, your recent attempt to donate has failed or was not completed successfully.</p>
        
        <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h3 style="color: #991b1b; margin-top: 0;">Failed Transaction Details</h3>
            <p style="margin: 5px 0;"><strong>Amount:</strong> <span style="color: #1e3a8a;">{amount}</span></p>
            <p style="margin: 5px 0;"><strong>Category:</strong> {category}</p>
            <p style="margin: 5px 0;"><strong>Transaction Ref:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 14px;">{tx_ref}</span></p>
        </div>
        
        <p>If you encountered an issue, please try again using a different payment method, or contact our support team.</p>
        <div style="text-align: center; margin-top: 30px;">
            <a href="{frontend_url}/donation" style="background-color: #fbbf24; color: #1e3a8a; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">Try Again</a>
        </div>
        """
        _send_html_email(subject, [email], message_body=message_body)

    def on_event_published(self, event):
        """
        Email the people the event is for: everyone for a general event, only the group's members for a group event.
        One mail connection for all of them; addresses that can never receive mail are skipped; capped per event.
        """
        from django.core.mail import get_connection
        from django.utils.html import escape

        from notifications.reminders import is_deliverable
        from service.event_rules import format_when, notification_audience

        people = [(u.email, u.first_name) for u in notification_audience(event).exclude(email="") if u.email]
        if getattr(settings, "REMINDER_EMAIL_SKIP_UNDELIVERABLE", True):
            people = [p for p in people if is_deliverable(p[0])]
        limit = getattr(settings, "EVENT_EMAIL_LIMIT", 300)
        if len(people) > limit:
            logger.warning("EmailChannel: event email limited to %s of %s people.", limit, len(people))
            people = people[:limit]
        if not people:
            return

        group = escape(event.service_group.name) if event.service_group_id else ""
        where = ""
        if event.place_name or event.place_url:
            label = escape(event.place_name or "Open the map")
            url = (event.place_url or "").strip()
            where = f"<p><strong>Where:</strong> {label}"
            if url.startswith(("http://", "https://")):
                where += f' (<a href="{escape(url)}">map</a>)'
            where += "</p>"
        details = escape(event.description or "").replace("\n", "<br>")
        link = f"{getattr(settings, 'FRONTEND_URL', '')}/dashboard/events"
        intro = (
            f"A new program was announced for the <strong>{group}</strong> group:" if group
            else "A new program was announced:"
        )
        subject = f"New event: {event.title}"

        sent = 0
        try:
            connection = get_connection()
            connection.open()
            try:
                for email, first_name in people:
                    body = (
                        f'<p style="font-size: 16px;">Dear <strong>{escape(first_name or "friend")}</strong>,</p>'
                        f"<p>{intro}</p>"
                        f'<div style="background-color: #f8fafc; border-left: 4px solid #fbbf24; padding: 15px; margin: 18px 0; border-radius: 4px;">'
                        f'<h3 style="margin: 0 0 8px 0; color: #1e3a8a;">{escape(event.title)}</h3>'
                        f"<p><strong>When:</strong> {escape(format_when(event))}</p>"
                        f"{where}"
                        f'<p style="margin-bottom: 0;">{details}</p>'
                        f"</div>"
                        f'<p style="margin: 24px 0;"><a href="{escape(link)}" style="background-color: #fbbf24; color: #1e3a8a; '
                        f'padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold;">See it on Finot</a></p>'
                    )
                    if _send_html_email(subject, [email], message_body=body, connection=connection):
                        sent += 1
            finally:
                connection.close()
        except Exception:
            logger.exception("EmailChannel: event email stopped early after %s", sent)
        logger.info("EmailChannel: event email sent to %s people.", sent)
