
TEMPLATES = {
                                                 
    "trip_assigned": {
        "en": """🚂 *New Trip Assigned*

*Trip ID:* {trip_id}
*Torpedo:* {torpedo}
*Route:* {producer} → {consumer}
*Time:* {time}

Please prepare for the trip.""",

        "hi": """🚂 *नई ट्रिप असाइन*

*ट्रिप आईडी:* {trip_id}
*टॉरपीडो:* {torpedo}
*रूट:* {producer} → {consumer}
*समय:* {time}

कृपया ट्रिप के लिए तैयार रहें।""",

        "kn": """🚂 *ಹೊಸ ಟ್ರಿಪ್ ನಿಯೋಜಿಸಲಾಗಿದೆ*

*ಟ್ರಿಪ್ ಐಡಿ:* {trip_id}
*ಟಾರ್ಪಿಡೋ:* {torpedo}
*ಮಾರ್ಗ:* {producer} → {consumer}
*ಸಮಯ:* {time}

ದಯವಿಟ್ಟು ಟ್ರಿಪ್‌ಗೆ ಸಿದ್ಧರಾಗಿ.""",

        "te": """🚂 *కొత్త ట్రిప్ కేటాయించబడింది*

*ట్రిప్ ఐడి:* {trip_id}
*టార్పిడో:* {torpedo}
*మార్గం:* {producer} → {consumer}
*సమయం:* {time}

దయచేసి ట్రిప్‌కు సిద్ధంగా ఉండండి.""",

        "ta": """🚂 *புதிய டிரிப் ஒதுக்கப்பட்டது*

*டிரிப் ஐடி:* {trip_id}
*டார்பிடோ:* {torpedo}
*வழி:* {producer} → {consumer}
*நேரம்:* {time}

தயவுசெய்து டிரிப்புக்கு தயாராக இருங்கள்.""",

        "mr": """🚂 *नवीन ट्रिप नियुक्त*

*ट्रिप आयडी:* {trip_id}
*टॉर्पिडो:* {torpedo}
*मार्ग:* {producer} → {consumer}
*वेळ:* {time}

कृपया ट्रिपसाठी तयार राहा.""",

        "gu": """🚂 *નવી ટ્રીપ સોંપવામાં આવી*

*ટ્રીપ ID:* {trip_id}
*ટોર્પિડો:* {torpedo}
*રૂટ:* {producer} → {consumer}
*સમય:* {time}

કૃપા કરીને ટ્રીપ માટે તૈયાર રહો.""",

        "bn": """🚂 *নতুন ট্রিপ বরাদ্দ*

*ট্রিপ আইডি:* {trip_id}
*টর্পেডো:* {torpedo}
*রুট:* {producer} → {consumer}
*সময়:* {time}

অনুগ্রহ করে ট্রিপের জন্য প্রস্তুত থাকুন।"""
    },

    "trip_started": {
        "en": """🚀 *Trip Started*

*Trip ID:* {trip_id}
*Torpedo:* {torpedo}
*Route:* {producer} → {consumer}
*Departed at:* {time}

Trip is now in progress.""",

        "hi": """🚀 *ट्रिप शुरू*

*ट्रिप आईडी:* {trip_id}
*टॉरपीडो:* {torpedo}
*रूट:* {producer} → {consumer}
*रवानगी:* {time}

ट्रिप अब प्रगति पर है।""",

        "kn": """🚀 *ಟ್ರಿಪ್ ಪ್ರಾರಂಭವಾಯಿತು*

*ಟ್ರಿಪ್ ಐಡಿ:* {trip_id}
*ಟಾರ್ಪಿಡೋ:* {torpedo}
*ಮಾರ್ಗ:* {producer} → {consumer}
*ಹೊರಟ ಸಮಯ:* {time}

ಟ್ರಿಪ್ ಈಗ ಪ್ರಗತಿಯಲ್ಲಿದೆ.""",

        "te": """🚀 *ట్రిప్ ప్రారంభమైంది*

*ట్రిప్ ఐడి:* {trip_id}
*టార్పిడో:* {torpedo}
*మార్గం:* {producer} → {consumer}
*బయలుదేరిన సమయం:* {time}

ట్రిప్ ఇప్పుడు పురోగతిలో ఉంది.""",

        "ta": """🚀 *டிரிப் தொடங்கியது*

*டிரிப் ஐடி:* {trip_id}
*டார்பிடோ:* {torpedo}
*வழி:* {producer} → {consumer}
*புறப்பட்ட நேரம்:* {time}

டிரிப் இப்போது நடந்து கொண்டிருக்கிறது.""",

        "mr": """🚀 *ट्रिप सुरू*

*ट्रिप आयडी:* {trip_id}
*टॉर्पिडो:* {torpedo}
*मार्ग:* {producer} → {consumer}
*निघालेली वेळ:* {time}

ट्रिप आता प्रगतीपथावर आहे.""",

        "gu": """🚀 *ટ્રીપ શરૂ થઈ*

*ટ્રીપ ID:* {trip_id}
*ટોર્પિડો:* {torpedo}
*રૂટ:* {producer} → {consumer}
*રવાના થયા:* {time}

ટ્રીપ હવે ચાલુ છે.""",

        "bn": """🚀 *ট্রিপ শুরু হয়েছে*

*ট্রিপ আইডি:* {trip_id}
*টর্পেডো:* {torpedo}
*রুট:* {producer} → {consumer}
*রওনা:* {time}

ট্রিপ এখন চলছে।"""
    },

    "trip_completed": {
        "en": """✅ *Trip Completed*

*Trip ID:* {trip_id}
*Torpedo:* {torpedo}
*Route:* {producer} → {consumer}
*Completed at:* {time}

Trip completed successfully.""",

        "hi": """✅ *ट्रिप पूर्ण*

*ट्रिप आईडी:* {trip_id}
*टॉरपीडो:* {torpedo}
*रूट:* {producer} → {consumer}
*पूर्ण समय:* {time}

ट्रिप सफलतापूर्वक पूर्ण।""",

        "kn": """✅ *ಟ್ರಿಪ್ ಪೂರ್ಣಗೊಂಡಿದೆ*

*ಟ್ರಿಪ್ ಐಡಿ:* {trip_id}
*ಟಾರ್ಪಿಡೋ:* {torpedo}
*ಮಾರ್ಗ:* {producer} → {consumer}
*ಪೂರ್ಣಗೊಂಡ ಸಮಯ:* {time}

ಟ್ರಿಪ್ ಯಶಸ್ವಿಯಾಗಿ ಪೂರ್ಣಗೊಂಡಿದೆ.""",

        "te": """✅ *ట్రిప్ పూర్తయింది*

*ట్రిప్ ఐడి:* {trip_id}
*టార్పిడో:* {torpedo}
*మార్గం:* {producer} → {consumer}
*పూర్తయిన సమయం:* {time}

ట్రిప్ విజయవంతంగా పూర్తయింది.""",

        "ta": """✅ *டிரிப் முடிந்தது*

*டிரிப் ஐடி:* {trip_id}
*டார்பிடோ:* {torpedo}
*வழி:* {producer} → {consumer}
*முடிந்த நேரம்:* {time}

டிரிப் வெற்றிகரமாக முடிந்தது.""",

        "mr": """✅ *ट्रिप पूर्ण*

*ट्रिप आयडी:* {trip_id}
*टॉर्पिडो:* {torpedo}
*मार्ग:* {producer} → {consumer}
*पूर्ण झाली:* {time}

ट्रिप यशस्वीरित्या पूर्ण.""",

        "gu": """✅ *ટ્રીપ પૂર્ણ*

*ટ્રીપ ID:* {trip_id}
*ટોર્પિડો:* {torpedo}
*રૂટ:* {producer} → {consumer}
*પૂર્ણ થયું:* {time}

ટ્રીપ સફળતાપૂર્વક પૂર્ણ થઈ.""",

        "bn": """✅ *ট্রিপ সম্পূর্ণ*

*ট্রিপ আইডি:* {trip_id}
*টর্পেডো:* {torpedo}
*রুট:* {producer} → {consumer}
*সম্পূর্ণ হয়েছে:* {time}

ট্রিপ সফলভাবে সম্পূর্ণ হয়েছে।"""
    },

    "deviation_alert": {
        "en": """⚠️ *Deviation Alert - {severity}*

*Trip ID:* {trip_id}
*Delay:* {delay_minutes} minutes
*Route:* {producer} → {consumer}

Please check and take necessary action.""",

        "hi": """⚠️ *विचलन अलर्ट - {severity}*

*ट्रिप आईडी:* {trip_id}
*देरी:* {delay_minutes} मिनट
*रूट:* {producer} → {consumer}

कृपया जाँच करें और आवश्यक कार्रवाई करें।""",

        "kn": """⚠️ *ವ್ಯತ್ಯಾಸ ಎಚ್ಚರಿಕೆ - {severity}*

*ಟ್ರಿಪ್ ಐಡಿ:* {trip_id}
*ವಿಳಂಬ:* {delay_minutes} ನಿಮಿಷಗಳು
*ಮಾರ್ಗ:* {producer} → {consumer}

ದಯವಿಟ್ಟು ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಅಗತ್ಯ ಕ್ರಮ ತೆಗೆದುಕೊಳ್ಳಿ.""",

        "te": """⚠️ *విచలన హెచ్చరిక - {severity}*

*ట్రిప్ ఐడి:* {trip_id}
*ఆలస్యం:* {delay_minutes} నిమిషాలు
*మార్గం:* {producer} → {consumer}

దయచేసి తనిఖీ చేసి అవసరమైన చర్య తీసుకోండి.""",

        "ta": """⚠️ *விலகல் எச்சரிக்கை - {severity}*

*டிரிப் ஐடி:* {trip_id}
*தாமதம்:* {delay_minutes} நிமிடங்கள்
*வழி:* {producer} → {consumer}

சரிபார்த்து தேவையான நடவடிக்கை எடுக்கவும்.""",

        "mr": """⚠️ *विचलन सूचना - {severity}*

*ट्रिप आयडी:* {trip_id}
*विलंब:* {delay_minutes} मिनिटे
*मार्ग:* {producer} → {consumer}

कृपया तपासा आणि आवश्यक कारवाई करा.""",

        "gu": """⚠️ *વિચલન ચેતવણી - {severity}*

*ટ્રીપ ID:* {trip_id}
*વિલંબ:* {delay_minutes} મિનિટ
*રૂટ:* {producer} → {consumer}

કૃપા કરીને તપાસો અને જરૂરી પગલાં લો.""",

        "bn": """⚠️ *বিচ্যুতি সতর্কতা - {severity}*

*ট্রিপ আইডি:* {trip_id}
*বিলম্ব:* {delay_minutes} মিনিট
*রুট:* {producer} → {consumer}

অনুগ্রহ করে পরীক্ষা করুন এবং প্রয়োজনীয় পদক্ষেপ নিন।"""
    },

    "daily_report_admin": {
        "en": """📊 *Daily Operations Report*
*Date:* {date}

*Summary:*
• Total Trips: {total_trips}
• Completed: {completed_trips}
• Pending: {pending_trips}

_Report generated by HMD System_""",

        "hi": """📊 *दैनिक संचालन रिपोर्ट*
*तारीख:* {date}

*सारांश:*
• कुल ट्रिप: {total_trips}
• पूर्ण: {completed_trips}
• लंबित: {pending_trips}

_HMD सिस्टम द्वारा रिपोर्ट_""",

        "kn": """📊 *ದೈನಂದಿನ ಕಾರ್ಯಾಚರಣೆ ವರದಿ*
*ದಿನಾಂಕ:* {date}

*ಸಾರಾಂಶ:*
• ಒಟ್ಟು ಟ್ರಿಪ್‌ಗಳು: {total_trips}
• ಪೂರ್ಣಗೊಂಡವು: {completed_trips}
• ಬಾಕಿ: {pending_trips}

_HMD ಸಿಸ್ಟಮ್ ವರದಿ_""",

        "te": """📊 *రోజువారీ కార్యకలాపాల నివేదిక*
*తేదీ:* {date}

*సారాంశం:*
• మొత్తం ట్రిప్‌లు: {total_trips}
• పూర్తయినవి: {completed_trips}
• పెండింగ్: {pending_trips}

_HMD సిస్టమ్ నివేదిక_""",

        "ta": """📊 *தினசரி செயல்பாட்டு அறிக்கை*
*தேதி:* {date}

*சுருக்கம்:*
• மொத்த டிரிப்கள்: {total_trips}
• முடிந்தவை: {completed_trips}
• நிலுவை: {pending_trips}

_HMD சிஸ்டம் அறிக்கை_""",

        "mr": """📊 *दैनिक कार्य अहवाल*
*तारीख:* {date}

*सारांश:*
• एकूण ट्रिप: {total_trips}
• पूर्ण: {completed_trips}
• प्रलंबित: {pending_trips}

_HMD सिस्टम अहवाल_""",

        "gu": """📊 *દૈનિક કામગીરી રિપોર્ટ*
*તારીખ:* {date}

*સારાંશ:*
• કુલ ટ્રીપ: {total_trips}
• પૂર્ણ: {completed_trips}
• બાકી: {pending_trips}

_HMD સિસ્ટમ રિપોર્ટ_""",

        "bn": """📊 *দৈনিক কার্যক্রম প্রতিবেদন*
*তারিখ:* {date}

*সারসংক্ষেপ:*
• মোট ট্রিপ: {total_trips}
• সম্পূর্ণ: {completed_trips}
• বাকি: {pending_trips}

_HMD সিস্টেম প্রতিবেদন_"""
    },

    "daily_report_producer": {
        "en": """📊 *Daily Report - {node_id}*
*Date:* {date}

*Your Summary:*
• Total Trips: {total_trips}
• Completed: {completed_trips}

_HMD System_""",

        "hi": """📊 *दैनिक रिपोर्ट - {node_id}*
*तारीख:* {date}

*आपका सारांश:*
• कुल ट्रिप: {total_trips}
• पूर्ण: {completed_trips}

_HMD सिस्टम_""",

        "kn": """📊 *ದೈನಂದಿನ ವರದಿ - {node_id}*
*ದಿನಾಂಕ:* {date}

*ನಿಮ್ಮ ಸಾರಾಂಶ:*
• ಒಟ್ಟು ಟ್ರಿಪ್‌ಗಳು: {total_trips}
• ಪೂರ್ಣಗೊಂಡವು: {completed_trips}

_HMD ಸಿಸ್ಟಮ್_""",

        "te": """📊 *రోజువారీ నివేదిక - {node_id}*
*తేదీ:* {date}

*మీ సారాంశం:*
• మొత్తం ట్రిప్‌లు: {total_trips}
• పూర్తయినవి: {completed_trips}

_HMD సిస్టమ్_""",

        "ta": """📊 *தினசரி அறிக்கை - {node_id}*
*தேதி:* {date}

*உங்கள் சுருக்கம்:*
• மொத்த டிரிப்கள்: {total_trips}
• முடிந்தவை: {completed_trips}

_HMD சிஸ்டம்_""",

        "mr": """📊 *दैनिक अहवाल - {node_id}*
*तारीख:* {date}

*तुमचा सारांश:*
• एकूण ट्रिप: {total_trips}
• पूर्ण: {completed_trips}

_HMD सिस्टम_""",

        "gu": """📊 *દૈનિક રિપોર્ટ - {node_id}*
*તારીખ:* {date}

*તમારો સારાંશ:*
• કુલ ટ્રીપ: {total_trips}
• પૂર્ણ: {completed_trips}

_HMD સિસ્ટમ_""",

        "bn": """📊 *দৈনিক প্রতিবেদন - {node_id}*
*তারিখ:* {date}

*আপনার সারসংক্ষেপ:*
• মোট ট্রিপ: {total_trips}
• সম্পূর্ণ: {completed_trips}

_HMD সিস্টেম_"""
    },

    "daily_report_consumer": {
        "en": """📊 *Daily Report - {node_id}*
*Date:* {date}

*Your Summary:*
• Trips Received: {total_trips}
• Completed: {completed_trips}

_HMD System_""",

        "hi": """📊 *दैनिक रिपोर्ट - {node_id}*
*तारीख:* {date}

*आपका सारांश:*
• प्राप्त ट्रिप: {total_trips}
• पूर्ण: {completed_trips}

_HMD सिस्टम_""",

        "kn": """📊 *ದೈನಂದಿನ ವರದಿ - {node_id}*
*ದಿನಾಂಕ:* {date}

*ನಿಮ್ಮ ಸಾರಾಂಶ:*
• ಸ್ವೀಕರಿಸಿದ ಟ್ರಿಪ್‌ಗಳು: {total_trips}
• ಪೂರ್ಣಗೊಂಡವು: {completed_trips}

_HMD ಸಿಸ್ಟಮ್_""",

        "te": """📊 *రోజువారీ నివేదిక - {node_id}*
*తేదీ:* {date}

*మీ సారాంశం:*
• అందుకున్న ట్రిప్‌లు: {total_trips}
• పూర్తయినవి: {completed_trips}

_HMD సిస్టమ్_""",

        "ta": """📊 *தினசரி அறிக்கை - {node_id}*
*தேதி:* {date}

*உங்கள் சுருக்கம்:*
• பெறப்பட்ட டிரிப்கள்: {total_trips}
• முடிந்தவை: {completed_trips}

_HMD சிஸ்டம்_""",

        "mr": """📊 *दैनिक अहवाल - {node_id}*
*तारीख:* {date}

*तुमचा सारांश:*
• प्राप्त ट्रिप: {total_trips}
• पूर्ण: {completed_trips}

_HMD सिस्टम_""",

        "gu": """📊 *દૈનિક રિપોર્ટ - {node_id}*
*તારીખ:* {date}

*તમારો સારાંશ:*
• મળેલી ટ્રીપ: {total_trips}
• પૂર્ણ: {completed_trips}

_HMD સિસ્ટમ_""",

        "bn": """📊 *দৈনিক প্রতিবেদন - {node_id}*
*তারিখ:* {date}

*আপনার সারসংক্ষেপ:*
• প্রাপ্ত ট্রিপ: {total_trips}
• সম্পূর্ণ: {completed_trips}

_HMD সিস্টেম_"""
    },

    "test": {
        "en": """🔔 *Test Message*

This is a test message from HMD System.
WhatsApp notifications are working correctly!

_Sent at: {time}_""",

        "hi": """🔔 *टेस्ट संदेश*

यह HMD सिस्टम से एक टेस्ट संदेश है।
WhatsApp सूचनाएं सही ढंग से काम कर रही हैं!

_भेजा गया: {time}_""",

        "kn": """🔔 *ಪರೀಕ್ಷಾ ಸಂದೇಶ*

ಇದು HMD ಸಿಸ್ಟಮ್‌ನಿಂದ ಪರೀಕ್ಷಾ ಸಂದೇಶ.
WhatsApp ಅಧಿಸೂಚನೆಗಳು ಸರಿಯಾಗಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತಿವೆ!

_ಕಳುಹಿಸಲಾಗಿದೆ: {time}_""",

        "te": """🔔 *పరీక్ష సందేశం*

ఇది HMD సిస్టమ్ నుండి పరీక్ష సందేశం.
WhatsApp నోటిఫికేషన్‌లు సరిగ్గా పనిచేస్తున్నాయి!

_పంపబడింది: {time}_""",

        "ta": """🔔 *சோதனை செய்தி*

இது HMD சிஸ்டத்திலிருந்து சோதனை செய்தி.
WhatsApp அறிவிப்புகள் சரியாக வேலை செய்கின்றன!

_அனுப்பப்பட்டது: {time}_""",

        "mr": """🔔 *चाचणी संदेश*

हा HMD सिस्टमकडून चाचणी संदेश आहे.
WhatsApp सूचना योग्यरित्या कार्य करत आहेत!

_पाठवले: {time}_""",

        "gu": """🔔 *ટેસ્ટ સંદેશ*

આ HMD સિસ્ટમનો ટેસ્ટ સંદેશ છે.
WhatsApp નોટિફિકેશન્સ યોગ્ય રીતે કામ કરી રહ્યા છે!

_મોકલ્યું: {time}_""",

        "bn": """🔔 *পরীক্ষা বার্তা*

এটি HMD সিস্টেম থেকে একটি পরীক্ষা বার্তা।
WhatsApp বিজ্ঞপ্তি সঠিকভাবে কাজ করছে!

_পাঠানো হয়েছে: {time}_"""
    }
}

SUPPORTED_LANGUAGES = {
    "en": "English",
    "hi": "हिंदी (Hindi)",
    "kn": "ಕನ್ನಡ (Kannada)",
    "te": "తెలుగు (Telugu)",
    "ta": "தமிழ் (Tamil)",
    "mr": "मराठी (Marathi)",
    "gu": "ગુજરાતી (Gujarati)",
    "bn": "বাংলা (Bengali)"
}

def get_template(template_name: str, language: str = "en", **kwargs) -> str:
    template_dict = TEMPLATES.get(template_name, {})

    template = template_dict.get(language) or template_dict.get("en", "")

    if not template:
        return f"[Template '{template_name}' not found]"

    try:
        return template.format(**kwargs)
    except KeyError as e:
        return f"[Template error: missing key {e}]"

