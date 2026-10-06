from rest_framework import serializers
from .models import Payment, StudentDonation, NonStudentDonation

class InitiateDonationSerializer(serializers.Serializer):
    """
    Serializer for initiating a donation.

    Nobody picks a category. A signed-in student's donation is their WEEKLY donation, given under their
    account. A visitor simply supports the Gibi Gubae and may add a name and an email (only for a receipt).
    """
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1)
    name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ['amount', 'currency', 'status', 'transaction_reference', 'created_at']

class DonationHistorySerializer(serializers.ModelSerializer):
    """
    Read-only serializer for student donation history.
    """
    payment = PaymentSerializer(read_only=True)
    
    class Meta:
        model = StudentDonation
        fields = ['id', 'fund_category', 'donated_at', 'payment']
