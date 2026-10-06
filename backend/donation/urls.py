from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import InitiateDonationView, VerifyDonationView, ChapaWebhookView, MyDonationHistoryViewSet, VerifyPendingTriggerView

router = DefaultRouter()
router.register(r'my-history', MyDonationHistoryViewSet, basename='donation-history')

urlpatterns = [
    # API endpoints
    path('initiate/', InitiateDonationView.as_view(), name='initiate-donation'),
    path('verify/<str:tx_ref>/', VerifyDonationView.as_view(), name='verify-donation'),
    path('webhook/', ChapaWebhookView.as_view(), name='webhook-donation'),
    path('cron/verify-pending/', VerifyPendingTriggerView.as_view(), name='cron-verify-pending'),
    path('', include(router.urls)),
]
