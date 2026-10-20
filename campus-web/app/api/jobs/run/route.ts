import {runReminders} from "../../../../lib/reminders";
import {json,unavailable} from "../../../../lib/server";
// This trigger cannot choose recipients, payloads or a fake clock. Only opted-in
// subscriptions and currently due, deduplicated events can produce a message.
export async function POST(){try{return json(await runReminders());}catch(e){return unavailable(e);}}
