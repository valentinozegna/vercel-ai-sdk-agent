---
description: Use when preparing a daily or morning briefing for the owner, or when setting up a recurring briefing routine.
---

# Daily briefing

A briefing is a short message the owner reads in under a minute.

## Gather

1. Check `<now>` for the local date and day of the week.
2. List routines (`list_routines`) to see what is scheduled today.
3. Recall from memory anything dated today or this week: appointments, deadlines, birthdays, travel.
4. If memory mentions the owner's city, search the weather for today.
5. If memory lists topics the owner follows, run one quick search per topic for news from the last 24 hours. Skip topics with nothing new.

## Write

Plain text, at most about 12 lines:

- Line 1: day and date, plus the weather in a few words.
- Today: scheduled items and deadlines, earliest first.
- Heads-up: anything coming in the next few days that needs preparation.
- News: one line per followed topic that has real news, with a link.

Leave out empty sections. No greeting or sign-off beyond a short "Good morning".

## Setting it up as a routine

Confirm the time with the owner, then create a routine with a cron such as `0 8 * * *` and a prompt like "Prepare and send the daily briefing using the daily-briefing skill."
