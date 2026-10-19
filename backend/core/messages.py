"""
Server messages in Amharic ("am") and Oromo ("om") for the account set-up (slips), shown to students.

The English text in the code is the key and the default. `tr(text, lang)` returns the translated text, or the
English text when there is no translation, so a missing entry can never break a page.
The Amharic and Oromo wording needs review by a native speaker.
"""

MESSAGES = {
    # --- Account page (student/account_setup.py) ---
    "The current password is not correct.": {
        "am": "የአሁኑ የይለፍ ቃል ትክክል አይደለም።",
        "om": "Jechi darbii amma ibsame sirrii miti.",
    },
    "Write a valid email address.": {
        "am": "ትክክለኛ የኢሜይል አድራሻ ይጻፉ።",
        "om": "Teessoo imeelii sirrii barreessi.",
    },
    "Use your own real email address.": {
        "am": "የራስዎን እውነተኛ የኢሜይል አድራሻ ይጠቀሙ።",
        "om": "Teessoo imeelii dhugaa kee mataa kee fayyadami.",
    },
    "This is already your email.": {
        "am": "ይህ አስቀድሞ የእርስዎ ኢሜይል ነው።",
        "om": "Kun duraan imeelii kee ti.",
    },
    "This email is already used by another account.": {
        "am": "ይህ ኢሜይል በሌላ መለያ ጥቅም ላይ ውሏል።",
        "om": "Imeelii kun herrega biraatiin fayyadamameera.",
    },
    "Too many codes were requested. Try again in an hour.": {
        "am": "ብዙ ኮዶች ተጠይቀዋል። ከአንድ ሰዓት በኋላ እንደገና ይሞክሩ።",
        "om": "Koodiiwwan baay'ee gaafatameera. Sa'aatii tokko booda irra deebi'ii yaali.",
    },
    "The email could not be sent. Check the address and try again.": {
        "am": "ኢሜይሉ መላክ አልተቻለም። አድራሻውን አረጋግጠው እንደገና ይሞክሩ።",
        "om": "Imeeliin ergamuu hin dandeenye. Teessoo mirkaneessiitii irra deebi'ii yaali.",
    },
    "The code has expired. Ask for a new one.": {
        "am": "ኮዱ ጊዜው አልፎበታል። አዲስ ይጠይቁ።",
        "om": "Yeroon koodii darbeera. Haaraa gaafadhu.",
    },
    "Too many wrong codes. Ask for a new one.": {
        "am": "ብዙ የተሳሳቱ ኮዶች ገብተዋል። አዲስ ይጠይቁ።",
        "om": "Koodiiwwan dogoggoraa baay'ee galfameera. Haaraa gaafadhu.",
    },
    "This code is not correct.": {
        "am": "ይህ ኮድ ትክክል አይደለም።",
        "om": "Koodiin kun sirrii miti.",
    },
    "First name is required.": {"am": "የመጀመሪያ ስም ያስፈልጋል።", "om": "Maqaan jalqabaa barbaachisaadha."},
    "First name is too long.": {"am": "የመጀመሪያ ስም በጣም ረጅም ነው።", "om": "Maqaan jalqabaa baay'ee dheeraadha."},
    "Father's name is required.": {"am": "የአባት ስም ያስፈልጋል።", "om": "Maqaan abbaa barbaachisaadha."},
    "Father's name is too long.": {"am": "የአባት ስም በጣም ረጅም ነው።", "om": "Maqaan abbaa baay'ee dheeraadha."},
    "Grandfather's name is required.": {"am": "የአያት ስም ያስፈልጋል።", "om": "Maqaan abbaa abbaa barbaachisaadha."},
    "Grandfather's name is too long.": {"am": "የአያት ስም በጣም ረጅም ነው።", "om": "Maqaan abbaa abbaa baay'ee dheeraadha."},
    "Your name is already saved. Ask an administrator to change it.": {
        "am": "ስምዎ አስቀድሞ ተቀምጧል። እንዲቀይሩት አስተዳዳሪን ይጠይቁ።",
        "om": "Maqaan kee duraanuu kuufameera. Akka jijjiiru bulchaa gaafadhu.",
    },
    "Choose male or female.": {"am": "ወንድ ወይም ሴት ይምረጡ።", "om": "Dhiira ykn dubartii filadhu."},
    "Choose a password different from the current one.": {
        "am": "ከአሁኑ የተለየ የይለፍ ቃል ይምረጡ።",
        "om": "Jecha darbii kan ammaa irraa adda ta'e filadhu.",
    },
    # Django password rules (shown as the code of the rule is known)
    "This password is too short. It must contain at least {n} characters.": {
        "am": "ይህ የይለፍ ቃል በጣም አጭር ነው። ቢያንስ {n} ፊደላት ወይም ቁጥሮች ሊኖሩት ይገባል።",
        "om": "Jechi darbii kun baay'ee gabaabaadha. Yoo xinnaate arfii {n} qabaachuu qaba.",
    },
    "This password is too common.": {
        "am": "ይህ የይለፍ ቃል በጣም የተለመደ ነው። ሌላ ይምረጡ።",
        "om": "Jechi darbii kun baay'ee beekamaadha. Kan biraa filadhu.",
    },
    "This password is entirely numeric.": {
        "am": "ይህ የይለፍ ቃል ቁጥሮች ብቻ ነው። ፊደላትም ይጨምሩ።",
        "om": "Jechi darbii kun lakkoofsa qofa. Qubeewwan dabali.",
    },
    "The password is too similar to your personal information.": {
        "am": "የይለፍ ቃሉ ከግል መረጃዎ ጋር በጣም ይመሳሰላል። ሌላ ይምረጡ።",
        "om": "Jechi darbii odeeffannoo dhuunfaa keetiin baay'ee wal fakkaata. Kan biraa filadhu.",
    },
    # --- email with the 6-digit code ---
    "Your Finot confirmation code": {
        "am": "የፊኖት ማረጋገጫ ኮድዎ",
        "om": "Koodii mirkaneessaa Finot kee",
    },
    "Your confirmation code is": {
        "am": "የማረጋገጫ ኮድዎ",
        "om": "Koodiin mirkaneessaa kee",
    },
    "It works for {minutes} minutes. If you did not ask for it, ignore this message.": {
        "am": "ለ{minutes} ደቂቃዎች ይሰራል። እርስዎ ካልጠየቁት ይህን መልዕክት ችላ ይበሉ።",
        "om": "Daqiiqaa {minutes} tajaajila. Yoo ati hin gaafanne ergaa kana dhiisi.",
    },
    # --- sign-in blocked after the slip expired (student/authentication.py) ---
    "Your email is confirmed. Choose your new password to continue.": {
        "am": "ኢሜይልዎ ተረጋግጧል። ለመቀጠል አዲስ የይለፍ ቃልዎን ይምረጡ።",
        "om": "Imeelii kee mirkanaa'eera. Itti fufuuf jecha darbii haaraa kee filadhu.",
    },
    "Your first slip has expired. Add your own email and a new password to continue.": {
        "am": "የመጀመሪያው ወረቀትዎ ጊዜው አልፎበታል። ለመቀጠል የራስዎን ኢሜይልና አዲስ የይለፍ ቃል ያክሉ።",
        "om": "Waraqaan kee isa jalqabaa yeroon darbeera. Itti fufuuf imeelii mataa keetii fi jecha darbii haaraa dabali.",
    },
    # --- reminders (notifications/account_setup_reminders.py) ---
    "Add your own email to Finot": {"am": "የራስዎን ኢሜይል ወደ ፊኖት ያክሉ", "om": "Imeelii mataa kee Finot irratti dabali"},
    "Your login slip works for {days} more days. Please add your real email and choose a new password (Account page).": {
        "am": "የመግቢያ ወረቀትዎ ለተጨማሪ {days} ቀናት ይሰራል። እባክዎ እውነተኛ ኢሜይልዎን ያክሉ እና አዲስ የይለፍ ቃል ይምረጡ (የመለያ ገጽ)።",
        "om": "Waraqaan seensaa kee guyyaa {days} dabalataaf ni hojjeta. Maaloo imeelii dhugaa kee dabaliitii jecha darbii haaraa filadhu (fuula herregaa).",
    },
    "One week left on your login slip": {"am": "ለመግቢያ ወረቀትዎ አንድ ሳምንት ቀርቷል", "om": "Waraqaan seensaa kee torban tokko hafeera"},
    "Your slip stops working in {days} days. Add your real email and a new password now so you can still sign in.": {
        "am": "ወረቀትዎ በ{days} ቀናት ውስጥ መሥራት ያቆማል። አሁንም መግባት እንዲችሉ እውነተኛ ኢሜይልዎንና አዲስ የይለፍ ቃል አሁን ያክሉ።",
        "om": "Waraqaan kee guyyaa {days} keessatti hojjechuu dhiisa. Ammas seenuu akka dandeessuuf imeelii dhugaa fi jecha darbii haaraa amma dabali.",
    },
    "Your login slip ends soon": {"am": "የመግቢያ ወረቀትዎ በቅርቡ ያበቃል", "om": "Waraqaan seensaa kee dhiyootti xumurama"},
    "Only {days} days left. Add your real email and a new password on the Account page.": {
        "am": "{days} ቀናት ብቻ ቀርተዋል። እውነተኛ ኢሜይልዎንና አዲስ የይለፍ ቃል በመለያ ገጽ ላይ ያክሉ።",
        "om": "Guyyaan {days} qofa hafeera. Imeelii dhugaa fi jecha darbii haaraa fuula herregaa irratti dabali.",
    },
    "Last day of your login slip": {"am": "የመግቢያ ወረቀትዎ የመጨረሻ ቀን", "om": "Guyyaa dhumaa waraqaa seensaa kee"},
    "Your slip stops working tomorrow. Add your real email and a new password today.": {
        "am": "ወረቀትዎ ነገ መሥራት ያቆማል። እውነተኛ ኢሜይልዎንና አዲስ የይለፍ ቃል ዛሬ ያክሉ።",
        "om": "Waraqaan kee boru hojjechuu dhiisa. Imeelii dhugaa fi jecha darbii haaraa har'a dabali.",
    },
    "Finish your account to continue": {"am": "ለመቀጠል መለያዎን ያጠናቅቁ", "om": "Itti fufuuf herrega kee xumuri"},
    "Your slip has expired. Add your real email and a new password to open Finot again.": {
        "am": "ወረቀትዎ ጊዜው አልፎበታል። ፊኖትን እንደገና ለመክፈት እውነተኛ ኢሜይልዎንና አዲስ የይለፍ ቃል ያክሉ።",
        "om": "Waraqaan kee yeroon darbeera. Finot irra deebi'ee banuuf imeelii dhugaa fi jecha darbii haaraa dabali.",
    },
}

SUPPORTED = ("am", "om")


def tr(text, lang="en", **values):
    """`text` in `lang` ('am', 'om'; anything else stays English). `{name}` places are filled from `values`."""
    if lang in SUPPORTED:
        text = MESSAGES.get(text, {}).get(lang, text)
    return text.format(**values) if values else text
