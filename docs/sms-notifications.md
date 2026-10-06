# SMS notifications — what is built, and what the organization must provide to switch it on

Written for: the Finot leadership who would fund SMS, and the developer who will connect it.

**Status: the code is finished and tested. SMS is OFF and costs nothing.** No provider account exists, no money is spent, and no message leaves the server. Going live needs three things from the organization: a provider account, a monthly budget, and about one day of developer time to connect the provider.

---

## 1. What students get

Only students who **opt in** (a checkbox in *Edit profile*, which needs a valid phone number) receive SMS. Three kinds only:

| Message | When | Who gets it |
|---|---|---|
| "Your private question was answered. Open Finot to read the answer." | A counselor answers a private question | The student who asked |
| "New event: <title>. Open Finot for the date and place." | A new upcoming event is published | Every opted-in student |
| The weekly donation reminder | Once a week (every Thursday, scheduled by a GitHub workflow) | Every opted-in student |

SMS never replaces the app notifications. In-app, email and push notifications keep working as before. The SMS text carries no private content, only "open the app".

## 2. What is already built

- **Opt-in** per student, off by default, with a phone-number check (Ethiopian formats such as `0911223344` and `+251911223344` are understood).
- **Master switch** in the Django admin: *Notifications → SMS configuration → Enabled*. Off by default.
- **Monthly limit** in the same screen (default 500 messages). When the limit is reached, sending stops by itself for the rest of the month. This is the budget protection.
- **Log of every attempt** (*Notifications → SMS logs*): who, which number, which message, sent / failed / limit reached / invalid phone, and which provider. The screen also shows messages used and remaining this month.
- **Safe failure**: if the provider is down, the problem is logged and the rest of the app (answers, events, other notifications) carries on.
- **Provider plug**: the free "console" provider writes messages to the server log instead of sending them. A real provider is one small class (section 6).

## 3. What the organization must decide and provide

| # | Item | Notes |
|---|---|---|
| 1 | **A provider account** | Someone from the organization creates it and keeps the login. The developer receives only the API keys, which go into the server settings. They are never put in the code. |
| 2 | **A monthly budget** | Decides the monthly limit in the admin screen (section 4). |
| 3 | **A sender name or short code, if the provider requires one** | **UNSURE:** Ethiopian operators may require registration of a sender name. The provider will say. This can take days or weeks. |
| 4 | **Language of the messages** | Now English. See the cost note below. |
| 5 | **Who watches the SMS logs** | Suggest the Super Admin checks them weekly in the first month. |

### Choosing a provider — questions to ask before paying

I could not verify prices or availability, so **no prices are stated here**. Ask each candidate (an international provider, or a local Ethiopian aggregator) for written answers to:

1. Can you deliver to Ethiopian numbers on **both** operators (Ethio Telecom and Safaricom Ethiopia)?
2. What is the price per message to Ethiopia, and is there a minimum top-up or monthly fee?
3. Do I need a registered sender name or short code, and how long does approval take?
4. Is there an HTTP API (a web address we call with a key)? Is there a test mode that costs nothing?
5. Do you send delivery reports, and what happens to failed messages: charged or refunded?
6. Is there prepaid credit (best for a hard cost ceiling), or do you bill monthly after use?

Prefer **prepaid credit**: the most that can ever be spent is what was topped up, on top of the monthly limit in the app.

## 4. Estimating the cost

```
messages per month = opted-in students × (events per month + weekly reminders per month) + answers sent
cost per month     = messages per month × price per message × segments per message
```

Example with **assumed numbers, to show the method only**: 400 opted-in students, 4 events and 4 reminders a month, about 40 answers → 400 × 8 + 40 = **3,240 messages a month**. Multiply by the real price from the provider.

**Segments:** a message in plain English fits in 160 characters, which is 1 segment. Amharic and Oromo-script text is billed as 70 characters per segment, so the same message can cost **2 to 3 times as much**. If messages are translated, budget for that.

Set the monthly limit in the admin to a bit above the estimate. If it is reached, the log shows "limit reached" and nothing more is sent until next month; the limit can be raised the same day.

## 5. Steps to go live (for the developer)

1. Organization creates the provider account and tops up a small amount of credit for testing.
2. Developer adds the provider class (section 6) and puts the keys in the server environment, with `SMS_PROVIDER=<name>`. Keys are never committed.
3. Test with 2 or 3 real phones: in the admin, switch SMS **Enabled** on, set the monthly limit to something tiny such as 10, opt in the test users, publish a test event, and check the phones and the *SMS logs*.
4. Confirm the delivery cost matches the price list.
5. **Check the weekly reminder schedule.** The Thursday reminder is already scheduled by a GitHub workflow (see [notifications-and-reminders.md](notifications-and-reminders.md)); once SMS is enabled it is sent by SMS too, to students who opted in.
6. Raise the monthly limit to the agreed budget and announce the opt-in to students.
7. Review the SMS logs after the first week: failed numbers, unexpected volume, cost against credit.

## 6. Adding the provider (developer)

All provider code lives in `backend/notifications/sms/providers.py`. A provider is a class with one method:

```python
class MyProvider:
    name = "myprovider"

    def send(self, phone, message):
        # phone is always +2519XXXXXXXX. Call the provider's API here.
        # Return the provider's message id, or raise an exception if the send failed.
        ...

PROVIDERS = {
    ConsoleProvider.name: ConsoleProvider,
    MyProvider.name: MyProvider,
}
```

Then set `SMS_PROVIDER=myprovider` and the provider's key variables in the server environment. Everything else (opt-in, the master switch, the monthly limit, logging, error handling) already works with any provider. Use an HTTP library such as `requests` (add it to the project dependencies with `uv add requests` if it is not there yet) and set a timeout of about 10 seconds.

Messages are sent from a background thread after the database commit, so a slow provider does not slow down the website. At the current size (hundreds of students) this is enough. If sending thousands at once ever becomes normal, move sending to a proper job queue (Celery or similar).

## 7. Privacy and good practice

- **Opt-in only**, off by default, and a student can turn it off at any time in *Edit profile*. Phone numbers are never used for SMS without the checkbox.
- The SMS text never contains the question, the answer, or any personal detail.
- The log stores the phone number and message text. Only the Super Admin should see it.
- No SMS replies are handled. Students cannot reply STOP; they turn it off in the app. If the provider offers an automatic STOP keyword, enable it.
- **Not built, by decision:** phone-number verification, SMS for "news" (the app has no news feature), and any SMS to people who did not opt in.

## 8. What is NOT yet tested

- Nothing has been sent through a real provider, because none is connected. The sending path is tested with a stand-in provider that records messages.
- The opt-in checkbox and its Amharic and Oromo wording have not been reviewed by a native speaker or tried in a browser.
- Delivery to both Ethiopian operators must be confirmed during step 3 above.

## 9. Where things are in the code

| Part | File |
|---|---|
| Sending rules, limit, logging | `backend/notifications/sms/__init__.py` |
| Providers | `backend/notifications/sms/providers.py` |
| Phone number cleanup | `backend/notifications/sms/phone.py` |
| The three triggers | `backend/notifications/channels/sms.py` and `management/commands/send_weekly_reminders.py` |
| Admin switch, limit and log | `backend/notifications/models.py` and `admin.py` |
| Opt-in field | `StudentProfile.sms_opt_in` and the *Edit profile* page |
| Tests | `backend/notifications/tests.py` |
