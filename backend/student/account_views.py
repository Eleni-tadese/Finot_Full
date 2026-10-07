"""
Account calls for every signed-in person (the set-up page and "change email / password").

  GET   /api/account/status/           the set-up state (deadline, what is still missing)
  POST  /api/account/email-code/       {email, current_password}   send a 6-digit code to the new address
  POST  /api/account/confirm-email/    {code}                      the login email becomes the new address
  POST  /api/account/change-password/  {current_password, new_password}
  POST  /api/account/names/            {first_name, middle_name, last_name, gender}   once, for slips made without names
"""
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import account_setup as setup


def _error(exc):
    return Response({exc.field: exc.message}, status=status.HTTP_400_BAD_REQUEST)


class AccountStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response({"email": request.user.email, "setup": setup.status_for(request.user)})


class EmailCodeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            email = setup.request_email_code(request.user, request.data.get("email"), request.data.get("current_password"))
        except setup.SetupError as exc:
            return _error(exc)
        return Response({"sent_to": email})


class ConfirmEmailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            email = setup.confirm_email_code(request.user, request.data.get("code"))
        except setup.SetupError as exc:
            return _error(exc)
        return Response({"email": email, "setup": setup.status_for(request.user)})


class NamesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        d = request.data
        try:
            setup.set_names(request.user, d.get("first_name"), d.get("middle_name"), d.get("last_name"), d.get("gender"))
        except setup.SetupError as exc:
            return _error(exc)
        return Response({"setup": setup.status_for(request.user)})


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            setup.change_password(request.user, request.data.get("current_password"), request.data.get("new_password"))
        except setup.SetupError as exc:
            return _error(exc)
        return Response({"setup": setup.status_for(request.user)})
