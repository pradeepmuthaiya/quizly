#!/usr/bin/env python3
"""Builds data/samples.json from the UDHR corpus (Article 1 of each translation).

Usage: python3 -I scripts/build_samples.py <path-to-udhr2-dir> data/samples.json
Corpus: https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/udhr2.zip
(the NLTK copy of Unicode's UDHR in Unicode collection).
"""
import json
import os
import re
import sys
import unicodedata
from collections import Counter

# language id -> (corpus file, BCP-47 tag)
SOURCES = {
    "afrikaans": ("afr", "af"), "akan": ("aka_asante", "ak"), "albanian": ("als", "sq"),
    "amharic": ("amh", "am"), "arabic": ("arb", "ar"), "armenian": ("hye", "hy"),
    "azerbaijani": ("azj_latn", "az"), "bambara": ("bam", "bm"), "belarusian": ("bel", "be"),
    "bemba": ("bem", "bem"), "bengali": ("ben", "bn"), "bislama": ("bis", "bi"),
    "bosnian": ("bos_latn", "bs"), "bulgarian": ("bul", "bg"), "burmese": ("mya", "my"),
    "cape-verdean-creole": ("kea", "kea"), "catalan": ("cat", "ca"), "chichewa": ("nya_chechewa", "ny"),
    "croatian": ("hrv", "hr"), "czech": ("ces", "cs"), "danish": ("dan", "da"),
    "dhivehi": ("div", "dv"), "dutch": ("nld", "nl"), "dzongkha": ("dzo", "dz"),
    "english": ("eng", "en"), "estonian": ("est", "et"), "ewe": ("ewe", "ee"), "fijian": ("fij", "fj"),
    "filipino": ("tgl", "fil"), "finnish": ("fin", "fi"), "fon": ("fon", "fon"), "french": ("fra", "fr"),
    "fula": ("fuc", "ff"), "georgian": ("kat", "ka"), "german": ("deu", "de"), "greek": ("ell_monotonic", "el"),
    "guarani": ("gug", "gn"), "guinea-bissau-creole": ("pov", "pov"), "haitian-creole": ("hat_kreyol", "ht"),
    "hausa": ("hau_NE", "ha"), "hebrew": ("heb", "he"), "hindi": ("hin", "hi"), "hungarian": ("hun", "hu"),
    "icelandic": ("isl", "is"), "indonesian": ("ind", "id"), "italian": ("ita", "it"), "japanese": ("jpn", "ja"),
    "kazakh": ("kaz", "kk"), "khmer": ("khm", "km"), "kinyarwanda": ("kin", "rw"), "kirundi": ("run", "rn"),
    "korean": ("kor", "ko"), "krio": ("kri", "kri"), "kyrgyz": ("kir", "ky"), "lao": ("lao", "lo"),
    "latvian": ("lav", "lv"), "lithuanian": ("lit", "lt"), "luxembourgish": ("ltz", "lb"),
    "macedonian": ("mkd", "mk"), "malagasy": ("plt", "mg"), "malay": ("mly_latn", "ms"), "maltese": ("mlt", "mt"),
    "mandarin": ("cmn_hans", "zh-Hans"), "mandarin-traditional": ("cmn_hant", "zh-Hant"),
    "marshallese": ("mah", "mh"), "mongolian": ("khk", "mn"), "moore": ("mos", "mos"), "nepali": ("nep", "ne"),
    "norwegian": ("nob", "nb"), "oshiwambo": ("ndo", "ng"), "palauan": ("pau", "pau"), "persian": ("pes_1", "fa"),
    "pijin": ("pis", "pis"), "polish": ("pol", "pl"), "portuguese": ("por_PT", "pt"), "romanian": ("ron", "ro"),
    "russian": ("rus", "ru"), "samoan": ("smo", "sm"), "sango": ("sag", "sg"), "serbian": ("srp_cyrl", "sr"),
    "sesotho": ("sot", "st"), "seychellois-creole": ("crs", "crs"), "shona": ("sna", "sn"), "slovak": ("slk", "sk"),
    "slovene": ("slv", "sl"), "somali": ("som", "so"), "spanish": ("spa", "es"), "swahili": ("swh", "sw"),
    "swati": ("ssw", "ss"), "swedish": ("swe", "sv"), "tajik": ("tgk", "tg"), "tetum": ("tet", "tet"),
    "thai": ("tha", "th"), "tigrinya": ("tir", "ti"), "tok-pisin": ("tpi", "tpi"), "tongan": ("ton", "to"),
    "tswana": ("tsn", "tn"), "turkish": ("tur", "tr"), "turkmen": ("tuk_latn", "tk"), "ukrainian": ("ukr", "uk"),
    "urdu": ("urd", "ur"), "uzbek": ("uzn_latn", "uz"), "vietnamese": ("vie", "vi"), "wolof": ("wol", "wo"),
    "zulu": ("zul", "zu"),
}

# Files whose Article 1 heading isn't "<word> 1". Value is a prefix of the heading line.
HEADINGS = {
    "fra": "Article premier", "bam": "Sariyasen fɔlɔ", "mos": "Pipi koɛɛga", "fuc": "Kuulal gadanal",
    "cmn_hans": "第一条", "cmn_hant": "第一條", "khk": "Нэгдүгээр зүйл", "pes_1": "مادهٔ اول",
    "heb": "סעיף א", "som": "Qod I", "plt": "ANDININY VOALOHANY", "kri": "Atikul Wan",
}

# Typos and editorial marks in the source text.
FIXES = {
    "hun": [("Minden. emberi", "Minden emberi")],
    "ell_monotonic": [("'Ολοι", "Όλοι")],
    "slk": [(" ,", ",")],
    "hrv": [("raćaju", "rađaju")],
    "tha": [("เกียรติศักด[เกียรติศักดิ์]", "เกียรติศักดิ์")],
}

SENTENCE_END = re.compile(r"[.।።۔。။។։።]|፡፡|།")
MAX_LENGTH = 90


def article_one(code, lines):
    if len(lines) == 1:  # single-line corpus entries hold only Article 1
        return lines[0]
    heading = HEADINGS.get(code)
    for i, line in enumerate(lines[:-1]):
        if heading:
            if line.startswith(heading):
                return lines[i + 1]
            continue
        digits = [c for c in line if c.isdigit()]
        if len(line) < 40 and len(digits) == 1 and unicodedata.digit(digits[0], -1) == 1 and len(lines[i + 1]) > 25:
            return lines[i + 1]
    raise ValueError(f"no Article 1 in {code}")


def first_sentence(text):
    match = SENTENCE_END.search(text, 20)
    sentence = text[: match.end()] if match else text
    if len(sentence) <= MAX_LENGTH:
        return sentence.strip()
    cut = sentence[:MAX_LENGTH]
    if " " in cut[40:]:
        cut = cut[: cut.rindex(" ")]
    return cut.rstrip(" ,;:،፣") + "…"


def script_of(text):
    counts = Counter()
    for char in text:
        if char.isalpha():
            name = unicodedata.name(char, "")
            counts["Han" if name.startswith("CJK") else name.split(" ")[0].title()] += 1
    if counts["Hiragana"] or counts["Katakana"]:
        return "Japanese"
    return counts.most_common(1)[0][0]


def main(corpus, output):
    samples = {}
    for language, (code, tag) in SOURCES.items():
        with open(os.path.join(corpus, code + ".txt"), encoding="utf-8") as handle:
            lines = [line.strip() for line in handle if line.strip()]
        text = article_one(code, lines)
        for old, new in FIXES.get(code, []):
            text = text.replace(old, new)
        sentence = first_sentence(unicodedata.normalize("NFC", text))
        samples[language] = {"text": sentence, "lang": tag, "script": script_of(sentence)}
    with open(output, "w", encoding="utf-8") as handle:
        json.dump(samples, handle, ensure_ascii=False, indent=1, sort_keys=True)
        handle.write("\n")
    print(f"wrote {len(samples)} samples")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
