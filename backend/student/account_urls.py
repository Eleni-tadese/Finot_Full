from django.urls import path

from . import account_views as v

urlpatterns = [
    path("status/", v.AccountStatusView.as_view()),
    path("email-code/", v.EmailCodeView.as_view()),
    path("confirm-email/", v.ConfirmEmailView.as_view()),
    path("change-password/", v.ChangePasswordView.as_view()),
]
