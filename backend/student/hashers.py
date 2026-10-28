"""
Password hashing for printed slips.

A slip password is random (about 54 bits) and temporary, so it is stored with a LIGHT PBKDF2 hash (30,000 rounds, about
40 ms) and checked with that same light hash. Django normally re-hashes a password to the full strength (1,000,000
rounds, more than a second of CPU) at the first sign-in; with a thousand students signing in at once on a small
server that queue is what makes the site look dead. This hasher leaves a slip hash alone. The password the student
chooses later (Account page, reset) is always stored with the full strength.
"""
from django.contrib.auth.hashers import PBKDF2PasswordHasher

SLIP_HASH_ITERATIONS = 30000


class SlipFriendlyPBKDF2PasswordHasher(PBKDF2PasswordHasher):
    """PBKDF2 as usual, except that a slip hash (exactly SLIP_HASH_ITERATIONS rounds) is not upgraded at sign-in."""

    def must_update(self, encoded):
        if self.decode(encoded)["iterations"] == SLIP_HASH_ITERATIONS:
            return False
        return super().must_update(encoded)
