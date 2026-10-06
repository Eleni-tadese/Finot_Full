from decouple import config
import requests
from django.conf import settings

class ChapaPayment:
    def __init__(self):
        # Chapa-specific Configuration
        # Defaults to the public test key if env variable not set
        self.CHAPA_SECRET = config('CHAPA_SECRET_KEY', default='')
        # Keys created in the new Chapa dashboard (dashboard.chapa.global) only work
        # against api.chapa.global. Override with CHAPA_API_BASE_URL if needed.
        base_url = (config('CHAPA_API_BASE_URL', default='') or 'https://api.chapa.global/v1').rstrip('/')
        self.CHAPA_URL = f"{base_url}/transaction/initialize"
        self.CHAPA_VERIFY_URL = f"{base_url}/transaction/verify/"
        
        self.headers = {
            'Authorization': f'Bearer {self.CHAPA_SECRET}',
            'Content-Type': 'application/json',
        }

    def initiate_payment(self, amount, currency, email, first_name, last_name, tx_ref, callback_url=None, return_url=None):
        """
        Initiates a payment request to Chapa.
        Returns the checkout_url on success, or raises an exception.
        """
        payload = {
            'amount': str(amount),
            'currency': currency,
            'tx_ref': tx_ref,
        }
        # email and names are optional for Chapa; a visitor may give none of them
        for key, value in (('email', email), ('first_name', first_name), ('last_name', last_name)):
            if value:
                payload[key] = value
        
        # Optional URLs for redirecting user after payment.
        # Chapa rejects anything that is not https:// (so http://localhost is skipped
        # in local development; pay on Chapa's page, then verify with
        # GET /api/donations/verify/<tx_ref>/ or use an https tunnel such as ngrok).
        if return_url and return_url.startswith('https://'):
            payload['return_url'] = return_url
        if callback_url and callback_url.startswith('https://'):
            payload['callback_url'] = callback_url

        try:
            response = requests.post(self.CHAPA_URL, json=payload, headers=self.headers, timeout=10)
            response.raise_for_status() # Raise error for 4xx/5xx
            
            data = response.json()
            if data['status'] == 'success':
                return data['data']['checkout_url']
            else:
                raise ValueError(f"Chapa Error: {data['message']}")
                
        except requests.exceptions.RequestException as e:
            # Netowrk error or key error
            raise ConnectionError(f"Failed to connect to Payment Gateway: {str(e)}")

    def check_payment(self, tx_ref):
        """
        Asks Chapa about a transaction. Returns "paid", "unpaid", or "unknown" when Chapa could not
        be reached (network trouble, Chapa down). "unknown" must never be treated as a failed payment.
        """
        url = f"{self.CHAPA_VERIFY_URL}{tx_ref}"
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
        except requests.exceptions.RequestException:
            return "unknown"
        if response.status_code >= 500:
            return "unknown"
        if response.status_code >= 400:
            return "unpaid"  # Chapa does not know this reference (never reached checkout)
        try:
            data = response.json()
        except ValueError:
            return "unknown"
        tx_status = str((data.get("data") or {}).get("status", "")).lower()
        return "paid" if str(data.get("status", "")).lower() == "success" and tx_status == "success" else "unpaid"

    def verify_payment(self, tx_ref):
        """
        Verifies a transaction using the tx_ref.
        """
        url = f"{self.CHAPA_VERIFY_URL}{tx_ref}"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            # Chapa returns data['status'] = 'success' in the wrapper,
            # and data['data']['status'] = 'success' for the actual transaction state
            # Chapa returns "success" in the wrapper and "SUCCESS"/"success" for the
            # transaction itself depending on the API version, so compare case-insensitively.
            tx_status = str((data.get('data') or {}).get('status', '')).lower()
            if str(data.get('status', '')).lower() == 'success' and tx_status == 'success':
                return True
            return False
            
        except requests.exceptions.RequestException:
            return False
