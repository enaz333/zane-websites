#!/usr/bin/env python3
"""Check Club migration destinations and a candidate Club origin."""

import argparse
from urllib.request import build_opener

from stage_workers import NoRedirect, check


def destinations():
    opener = build_opener(NoRedirect())
    check(opener, "https://zanegiordano.com", "/PhotoNotes?migration=club", 200,
          marker=b"Photo Notes")
    check(opener, "https://acl.zanegiordano.com", "/acl/", 200, marker=b"ACL")
    check(opener, "https://coachella.zanegiordano.com", "/coachella/", 200,
          marker=b"Coachella")


def candidate(club, personal, acl, coachella):
    opener = build_opener(NoRedirect())
    check(opener, club, "/", 200, marker=b"forms.gle/QemuZmv9eEhDkomCA")
    check(opener, club, "/redesign.html", 200, marker=b"forms.gle/QemuZmv9eEhDkomCA")
    check(opener, club, "/BuildFest", 301, location=club + "/buildfest/")
    for path in ("/buildfest/gallery", "/buildfest/gallery.html"):
        check(opener, club, path, 200, marker=b"Project Gallery")
    for path in ("/buildfest/BuildFest_Support_Plugin.zip",
                 "/buildfest/files/BuildFest_Design_Brief_Template.docx"):
        check(opener, club, path, 200, marker=b"PK")
    for prefix in ("PhotoNotes", "photonotes", "photo-notes", "PHOTO-NOTES"):
        for suffix in ("", "/", "/index.html", "/missing/deep"):
            target = "/PhotoNotes" + (suffix if suffix == "/missing/deep" else "")
            check(opener, club, f"/{prefix}{suffix}?card=probe%2B1", 302,
                  location=personal + target + "?card=probe%2B1")
    check(opener, personal, "/PhotoNotes?card=probe%2B1", 200, marker=b"Photo Notes")
    check(opener, personal, "/PhotoNotes/missing/deep?card=probe%2B1", 404)
    check(opener, club, "/acl/donate/haam/?x=1", 302, location=acl + "/acl/donate/haam/?x=1")
    check(opener, club, "/coachella/sample-exportify/Exportify_Test.zip?x=1", 302,
          location=coachella + "/coachella/sample-exportify/Exportify_Test.zip?x=1")
    check(opener, club, "/photo-notes-unrelated", 404)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--destinations", action="store_true")
    mode.add_argument("--candidate", nargs=4, metavar=("CLUB", "PERSONAL", "ACL", "COACHELLA"))
    args = parser.parse_args()
    if args.destinations:
        destinations()
    else:
        candidate(*args.candidate)
