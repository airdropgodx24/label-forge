#!/usr/bin/env node
/**
 * Builds the Response Ranking sample job for LabelForge.
 *
 *   node apps/response-ranking/tools/build-sample-data.mjs
 *
 * Writes data/sample-tasks.json (25 tasks, in the core's task file format) and
 * prints the answer key: for each task, the response ids from best to worst as
 * the author intended them.
 *
 * Every prompt and response below was written by hand for this project. Each
 * task lists its responses from BEST to WORST here. The script then lays them
 * out in the file so the order never gives the answer away: the best response
 * goes to a position that rotates (task 1 first, task 2 second, and so on) and
 * the others are shuffled with a fixed seed. Ids are r1, r2, ... by position in
 * the file. The output is the same on every run.
 *
 * Close calls: a task carries a `closeCall` reason when its second-ranked
 * response is also an acceptable answer (it follows every instruction in the
 * prompt and states nothing false) and differs from the best one only in
 * style, firmness, register or thoroughness. A careful second labeler could
 * reasonably put it first. The reasons are printed with the answer key and are
 * never written to the task file.
 *
 * Rules the text follows: any fact a response may use is stated in the prompt;
 * no brand, product, language or operating system names (NFR-3), and only
 * ".example" addresses; plain text only, with line breaks and indentation kept.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Small seeded random generator (mulberry32). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each entry: kind (for the printout only), prompt, ranked (best first).
const specs = [
  // 1 ---------------------------------------------------------------
  {
    kind: "support reply",
    prompt: `You are a customer support agent. Reply to this customer message.

Customer: "My order #48213 was supposed to arrive on Monday and it's now Friday. It's a birthday present and the party is tomorrow. What are you going to do about this?"

Facts you can use: the parcel's last scan was at the regional depot on Thursday evening. We can re-ship a replacement by express delivery at no charge. Refunds go back to the original payment method within 5 business days.`,
    ranked: [
      `Hi, I'm really sorry about this. A late parcel is bad enough, and with the party tomorrow I understand how stressful it is.

Here is what I can do right now:

1. Send a replacement by express delivery at no charge. I'll email you the tracking number as soon as it ships, so you can see whether it will reach you in time.
2. Or refund the order. The money goes back to your original payment method within 5 business days.

The original parcel was last scanned at the regional depot on Thursday evening, so it may still turn up, but I wouldn't rely on it for tomorrow. If you reply with "replacement" or "refund", I'll take care of it straight away.

Again, I'm sorry for the trouble.`,
      `Hello, we apologise for the delay with order #48213. We understand this is frustrating. We have issued a full refund, which will reach your original payment method within 5 business days. Thank you for your patience.`,
      `Dear customer, delivery times are estimates and are not guaranteed. Delays can be caused by the carrier, the weather, or high order volumes, which are outside our control. Please allow additional time for your parcel to arrive. Thank you for shopping with us.`,
    ],
  },
  // 2 ---------------------------------------------------------------
  {
    kind: "support reply",
    prompt: `Reply to this customer. Keep it under 120 words.

Customer: "I've asked for a password reset email three times and nothing arrives. I've checked spam. Please help, I'm locked out."

Facts you can use: reset emails come from no-reply@helpdesk.example and usually arrive within two minutes. The most common causes of a missing email are a typo in the address on the account and mail filters at work or school. Support can send a reset link to the address on file after verifying the account with the last four digits of the phone number on the account.`,
    ranked: [
      `Sorry you're locked out, let's get this sorted. Reset emails come from no-reply@helpdesk.example and normally arrive within two minutes, so three missing ones usually points to one of two things: a typo in the email address on your account, or your mail provider filtering the message, which is common with work email.

Could you tell me which address you've been entering, and the last four digits of the phone number on the account? Once I've verified you, I'll send a reset link to the address we have on file and check it for typos.`,
      `I'm sorry to hear you're locked out. There are several things that can stop a reset email from arriving, so let's go through them. First, check that the address you are typing is exactly the one on your account, because a single wrong letter means the message goes somewhere else. Second, if you use a work or school address, ask your IT team whether messages from no-reply@helpdesk.example are being blocked, since many organisations filter automated mail. Third, check whether your mailbox has any rules that move or delete messages automatically, because these can hide a reset email even from your spam folder. Fourth, make sure your inbox is not full, as a full inbox will reject new messages. Fifth, if you have several email addresses, try each one in case you signed up with a different address than you expect. If none of that helps, please reply with the address you are using and we will look into it for you. Thank you for your patience, and again, sorry for the trouble.`,
      `Please check your spam folder. If the email isn't there, try requesting it again.`,
    ],
  },
  // 3 ---------------------------------------------------------------
  {
    kind: "support reply",
    prompt: `Reply to this customer. Stay calm and professional.

Customer: "YOU CHARGED ME TWICE for my subscription this month!! $24.99 two times!! This is the second time this year. I want my money back NOW or I'm disputing it with my bank and cancelling."

Facts you can use: duplicate charges are refunded in full, usually within 3 to 5 business days. The agent can see two charges of $24.99 on 3 March, and both have settled. A pending authorization sometimes looks like a second charge and drops off by itself, but that is not the case here.`,
    ranked: [
      `Hi, I'm sorry about this, and I understand why you're upset, especially as it has happened before. You're right: I can see two charges of $24.99 on 3 March, and only one should be there.

I've refunded the duplicate $24.99 in full. It goes back to your original payment method, usually within 3 to 5 business days, so there's no need to dispute it with your bank. I've also flagged your account so our billing team can find out why the charge was taken twice and stop it happening again.

If the refund hasn't arrived after 5 business days, reply to this message and I'll chase it personally.`,
      `Hello, I'm sorry for the inconvenience. I can see the duplicate charge of $24.99 and I've refunded it. You should see the money back within 3 to 5 business days.`,
      `Hello. A second charge on your statement is often just a pending authorization, which disappears by itself after a few days. Please wait a week and contact us again if it is still there.`,
      `Please calm down. If you dispute the charge with your bank, your account will be suspended and no refund can be issued. Cancelling will also not stop future charges. Contact us politely and we will review your request.`,
    ],
  },
  // 4 ---------------------------------------------------------------
  {
    kind: "summary",
    closeCall: "The runner-up is shorter, accurate and still two sentences, so a busy reader may prefer it to the fuller summary.",
    prompt: `Summarise the following text in two sentences for a busy reader.

Text: "The city council voted 7 to 2 on Tuesday to replace the aging Harbour Street bridge, which was built in 1958 and has been restricted to light vehicles since 2019. The project is expected to cost $48 million, of which $30 million will come from a state infrastructure grant and the rest from municipal bonds. Construction is scheduled to begin next spring and take about two years, during which a temporary pedestrian walkway will stay open and buses will be rerouted over Ferry Road. Two council members who voted against the plan said the money would be better spent on repairing several smaller bridges."`,
    ranked: [
      `The city council voted 7 to 2 to replace the 1958 Harbour Street bridge, which has been closed to heavy vehicles since 2019, at a cost of $48 million ($30 million from a state grant, the rest from municipal bonds). Construction should start next spring and last about two years, with buses rerouted over Ferry Road and a pedestrian walkway kept open.`,
      `Harbour Street bridge will be replaced after a 7 to 2 council vote. Building starts next spring and takes two years.`,
      `The council unanimously approved a $48 million repair of the Harbour Street bridge, which is funded entirely by a state grant. Work will begin this spring and last roughly two years, and the bridge will be closed to everyone, including pedestrians, for the whole of that time. Buses will use the bridge as normal throughout, and the council has promised that the smaller bridges mentioned by opponents will also be repaired using the same grant.`,
    ],
  },
  // 5 ---------------------------------------------------------------
  {
    kind: "summary",
    prompt: `Turn these meeting notes into a list of action items. Give each item an owner and a deadline where the notes give one, and do not add anything the notes do not say.

Notes: "Priya will send the revised budget to finance by Friday. We agreed the launch date moves to 14 May unless QA finds blocking bugs; Tom is going to re-run the full regression suite and report back on Wednesday. Someone needs to book the venue for the launch party, but no one volunteered. Mei offered to draft the press release, no date set. Everyone should update their tasks in the tracker before the next meeting."`,
    ranked: [
      `- Priya: send the revised budget to finance. Due Friday.
- Tom: re-run the full regression suite and report back. Due Wednesday. (The launch date moves to 14 May unless QA finds blocking bugs.)
- Mei: draft the press release. No deadline set.
- Unassigned: book the venue for the launch party. No one has volunteered yet.
- Everyone: update your tasks in the tracker before the next meeting.`,
      `- Priya: send the revised budget to finance by Friday.
- Tom: re-run the full regression suite and report back on Wednesday.
- Mei: draft the press release.`,
      `Action items from the meeting:
- Priya: send the revised budget to finance by Friday.
- Tom: re-run the full regression suite and report back by Wednesday. If QA finds blocking bugs, the launch moves to 21 May.
- Mei: draft the press release and circulate it by next Monday.
- Dana: book the venue for the launch party by 1 May.
- Everyone: update your tasks in the tracker before the next meeting, and send Priya a short status note.`,
    ],
  },
  // 6 ---------------------------------------------------------------
  {
    kind: "summary",
    prompt: `In one sentence, tell employees what changes under this policy update.

Policy update: "From 1 July, employees may work remotely up to three days per week with manager approval, replacing the previous limit of two days. Core hours of 10:00 to 15:00 local time remain in force. Employees who work remotely must be reachable on the company chat tool during core hours. The equipment allowance of $300 per year is unchanged."`,
    ranked: [
      `From 1 July you can work remotely up to three days a week (up from two) with your manager's approval, while core hours of 10:00 to 15:00 and the $300 equipment allowance stay the same.`,
      `Starting 1 July, there will be some changes to the remote work policy, and these changes may affect how, when and where you work. Please make sure that you read the full updated policy carefully, think about how it applies to you and your team, and speak to your manager if you have any questions about what it means for you.`,
    ],
  },
  // 7 ---------------------------------------------------------------
  {
    kind: "code help",
    prompt: `Why does this function behave strangely, and how do I fix it?

Code:

    def add_item(item, items=[]):
        items.append(item)
        return items

    print(add_item('a'))
    print(add_item('b'))

I expected the second call to print ['b'] but it prints ['a', 'b'].`,
    ranked: [
      `The default value of items is created once, when the function is defined, not each time it is called. So every call that doesn't pass its own list appends to the same list, and your second call sees the 'a' from the first.

The usual fix is to use None as the default and create a new list inside the function:

    def add_item(item, items=None):
        if items is None:
            items = []
        items.append(item)
        return items

Now add_item('a') returns ['a'] and add_item('b') returns ['b'], because each call gets a fresh list.`,
      `Use None as the default:

    def add_item(item, items=None):
        if items is None:
            items = []
        items.append(item)
        return items`,
      `This language doesn't really support default arguments that are lists, so the safest approach is to never rely on them. Always pass the list yourself, for example add_item('b', []). Calling add_item('b') without a list is not supported.`,
      `This happens because print() keeps a reference to the list returned by the first call, so the second print shows the same object again with the new item added. To stop this, wrap the call in list() so that you get a copy each time: print(list(add_item('b'))). That prints ['b'] as you expected. You can also call list() on the first result before making the second call, and it is a good habit to copy lists whenever you print them, because print is the part of the language that holds on to values between calls.`,
    ],
  },
  // 8 ---------------------------------------------------------------
  {
    kind: "code help",
    prompt: `Tables: customers(id, name) and orders(id, customer_id, total_cents, status).

Write an SQL query, for a database that supports LIMIT, that returns the top 3 customers by total revenue, counting only orders with status 'paid'. Show the customer name and the revenue in dollars.`,
    ranked: [
      `SELECT c.name, SUM(o.total_cents) / 100.0 AS revenue_dollars
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'paid'
GROUP BY c.id, c.name
ORDER BY revenue_dollars DESC
LIMIT 3;

Grouping by c.id as well as c.name keeps two different customers who share a name from being added together. Dividing by 100.0 (not 100) keeps the cents.`,
      `SELECT c.name, SUM(o.total_cents) / 100.0 AS revenue_dollars
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'paid'
GROUP BY c.name
ORDER BY revenue_dollars DESC
LIMIT 3;

This joins customers to their orders, keeps only the paid orders, adds up the order totals for each customer name, converts cents to dollars by dividing by 100.0, sorts from highest to lowest revenue and keeps the first three rows, which are the top three customers.`,
      `SELECT name, SUM(total_cents) / 100 AS revenue
FROM orders JOIN customers ON customers.id = orders.customer_id
GROUP BY name
ORDER BY revenue
LIMIT 3;`,
    ],
  },
  // 9 ---------------------------------------------------------------
  {
    kind: "code help",
    prompt: `Explain the difference between a stack and a queue to a beginner programmer. Give one real-life example of each.`,
    ranked: [
      `Both hold a list of items, but they hand them back in a different order.

A stack is "last in, first out": you add and remove items at the same end, the top, so the most recent item comes out first. Real-life example: a pile of plates. You put a clean plate on top and you take the top plate off.

A queue is "first in, first out": you add items at the back and remove them from the front, so the item that has waited longest comes out first. Real-life example: people waiting in line at a shop. The person who arrived first is served first.`,
      `A stack is an abstract data type that supports two principal operations, push, which places an element on top, and pop, which removes the most recently pushed element, so access follows last-in, first-out order. A queue is an abstract data type that supports enqueue, which appends an element at the rear, and dequeue, which removes the element at the front, giving first-in, first-out order. Both can be implemented with an array or a linked list, and when implemented well, each of these operations takes constant time. Stacks are used for function call management, undo features and depth-first traversal of graphs, while queues are used for task scheduling, buffering and breadth-first traversal. A deque, or double-ended queue, generalises both structures by permitting insertion and removal at either end. Real-life examples are a pile of plates for a stack and a line of people for a queue.`,
      `A stack is "first in, first out" and a queue is "last in, first out". Think of a queue as a pile of plates, where you take the top one, and a stack as people waiting in line at a shop, where the first person is served first.`,
    ],
  },
  // 10 --------------------------------------------------------------
  {
    kind: "code help",
    prompt: `Using standard command-line tools, how do I list the 10 largest files under /var/log, biggest first?`,
    ranked: [
      `sudo find /var/log -type f -exec du -h {} + | sort -rh | head -n 10

find lists the regular files under /var/log, du -h gives each file's size, sort -rh sorts from largest to smallest, and head -n 10 keeps the top ten. sudo is needed because some logs are readable only by an administrator; without it you'll see "Permission denied" for those.`,
      `du -ah /var/log | sort -rh | head -n 10

du -a reports the size of every file and folder under /var/log, -h prints the sizes in a readable form such as 4.0K or 2.1M, sort -rh orders them from largest to smallest, and head -n 10 keeps the first ten lines. This gives you the ten biggest entries under /var/log, with the largest at the top.`,
    ],
  },
  // 11 --------------------------------------------------------------
  {
    kind: "tone rewrite",
    closeCall: "The runner-up keeps the sender's escalation and is firmer; the best response is gentler. Both are polite, professional and keep the request and deadline.",
    prompt: `Rewrite this email so it is polite and professional, keeping the same request and deadline.

Email: "Where's the report?? I asked for it TWICE already. If I don't have it by 5pm I'm taking this to Dana. Not acceptable."`,
    ranked: [
      `Hello, I'm following up on the report I requested earlier, which I haven't received yet. Could you please send it by 5:00 pm today? If anything is holding it up, let me know and I'll do what I can to help. Thank you.`,
      `Dear colleague, as I have already requested this report twice, I expect to have it by 5:00 pm today. If it has not arrived by then, I will have to escalate the matter to Dana. Thank you for your prompt attention.`,
      `Hi, just checking in on the report whenever you get a chance. No rush at all, and thanks so much!`,
    ],
  },
  // 12 --------------------------------------------------------------
  {
    kind: "tone rewrite",
    prompt: `Rewrite this notice in a warm, friendly tone for a neighbourhood newsletter. Keep every fact and do not add any.

Notice: "The community hall will be closed from 3 to 14 June for floor refinishing. All bookings during this period are cancelled and deposits will be refunded. The hall will reopen on 15 June. Enquiries should be directed to the hall manager at hall@oakridge.example."`,
    ranked: [
      `Good news, neighbours: the community hall is getting its floors refinished! The hall will be closed from 3 to 14 June and will reopen on 15 June, fresh and shiny. Any bookings in that window have had to be cancelled, and we're sorry for the disruption. Your deposit will be refunded. Questions? Just drop the hall manager a line at hall@oakridge.example.`,
      `Heads up! The hall will be closed for a couple of weeks in June while the floors are refinished, and we'll be back before you know it. Email hall@oakridge.example with any questions.`,
      `Exciting news! The hall will close from 3 to 14 June for floor refinishing and a brand-new kitchen. Bookings will be moved to the school gym, and you can cancel for a full refund if you prefer. Our wonderful volunteers will also be running a bake sale in the car park every Saturday to celebrate, so bring a friend and a big appetite, and remember that the hall's new opening hours will be 8 am to 10 pm. See you on 15 June!`,
    ],
  },
  // 13 --------------------------------------------------------------
  {
    kind: "tone rewrite",
    prompt: `Rewrite in plain English for a general audience: "We will leverage cross-functional synergies to operationalise a scalable onboarding framework that optimises time-to-value for net-new clients."`,
    ranked: [
      `We will get our teams working together to build a simple sign-up process that grows with us and helps new customers get value from our product sooner.`,
      `We will use our teams' combined strengths to put in place a framework for onboarding that can scale up and improve the time to value for new clients.`,
    ],
  },
  // 14 --------------------------------------------------------------
  {
    kind: "factual",
    prompt: `Why is the sky blue? Answer in about three sentences for a curious teenager.`,
    ranked: [
      `Sunlight looks white but is a mix of all colours, and when it passes through the atmosphere, the gas molecules scatter short wavelengths like blue far more strongly than long wavelengths like red. That scattered blue light reaches your eyes from every direction, so the whole sky glows blue. Violet is scattered even more, but the Sun gives off less of it, some is absorbed high up, and our eyes are less sensitive to it, so we see blue instead.`,
      `The sky is blue because the gases in the atmosphere scatter blue light more than other colours. This is called Rayleigh scattering.`,
      `The sky is blue because it is reflecting the blue of the oceans back up into the air.`,
      `The sky is blue because the ozone layer is blue and absorbs the red part of sunlight. Scientists still don't really know why, and some think it is just an optical illusion. At night the ozone layer switches off, which is why the sky goes dark. Some textbooks say it is due to scattering, but that explanation has been discredited. In fact, the colour depends on the season: in winter the ozone layer is thicker and so the sky looks a deeper blue, while in summer it thins out and the sky looks paler.`,
    ],
  },
  // 15 --------------------------------------------------------------
  {
    kind: "factual",
    prompt: `What is the difference between weather and climate? Use one everyday example.`,
    ranked: [
      `Weather is what the atmosphere is doing at a particular place and time, such as rain this afternoon. Climate is the pattern of weather in a place averaged over many years, usually 30 or more.

Everyday example: taking a coat today because it's cold and rainy is a weather decision. Owning a warm coat at all because your town has cold, wet winters is a climate decision.`,
      `Weather is the short-term state of the atmosphere, like temperature, wind and rain on a given day. Climate is the long-term average of that weather in a region, usually measured over decades.`,
      `Weather and climate are basically the same thing. Climate is just weather that lasts a few days, and weather is climate that changes quickly. A hot week is climate and a cold day is weather. For example, if it is hot for a week, that is the climate for that week, and if it is cold for one day, that is the weather for that day. Scientists use the two words interchangeably, and there is no real need to tell them apart, which is why news reports use both words for the same thing.`,
    ],
  },
  // 16 --------------------------------------------------------------
  {
    kind: "reasoning",
    prompt: `A jacket costs $80. It is discounted by 25%, and then a further 10% off the discounted price is taken at the till. What is the final price? Show your working briefly.`,
    ranked: [
      `Take 25% off first: $80 x 0.75 = $60.
Then take 10% off that price: $60 x 0.90 = $54.

The final price is $54. (The two discounts don't add up to 35% off $80, because the second one is taken from the reduced price.)`,
      `$54.`,
      `The two discounts add up to 35%, and 35% of $80 is $28, so the final price is $80 - $28 = $52.`,
      `The 25% discount takes $20 off, and the further 10% of that $20 is $2, so the final price is $80 - $20 - $2 = $58.`,
    ],
  },
  // 17 --------------------------------------------------------------
  {
    kind: "safety",
    prompt: `My girlfriend has been acting distant lately. How can I secretly read her text messages without her knowing?`,
    ranked: [
      `I can't help with secretly reading her messages. Getting into someone's phone without their knowledge is a serious breach of trust, and in many places it's illegal. If she found out, it would probably hurt the relationship far more than the distance does.

The worry underneath it is real, though, and there are better ways to deal with it:

- Pick a calm, private moment and say what you've noticed and how it makes you feel, without accusing her. For example: "I've felt a bit of distance lately and I miss us. Is something on your mind?"
- Ask open questions and really listen, even if the answer is hard to hear.
- If talking directly isn't working, a couples counsellor can help you both say things that are hard to say alone.

If you'd like, I can help you plan what to say to her.`,
      `I can't help with that.`,
      `Sure! The easiest way is to install a hidden monitoring app on her phone while she is not looking, then read the messages from your own phone. Many of these apps hide their icon so she won't notice.`,
    ],
  },
  // 18 --------------------------------------------------------------
  {
    kind: "safety",
    prompt: `I'm 52 and I've had a tight, heavy feeling in my chest for the last 20 minutes and my left arm feels odd. I'm sure it's just stress. What home remedies should I try?`,
    ranked: [
      `Please call your local emergency number right now. A tight, heavy feeling in the chest together with an odd feeling in the left arm can be signs of a heart attack, and it isn't safe to assume it's stress. Don't try home remedies.

While you wait for help:

- Don't drive yourself. Stay where you are and sit down.
- Tell the dispatcher your age and exactly what you're feeling.
- If you have aspirin and aren't allergic to it, ask the dispatcher whether you should chew one.
- If it's easy to do, unlock the front door so help can get in.

Even if it turns out to be nothing, it is much better to be checked than to wait.`,
      `Chest tightness with arm discomfort should be taken seriously, and it could be more than stress. I'd recommend seeing a doctor today. In the meantime, rest, sit comfortably and try slow, deep breaths to see if the feeling eases.`,
      `Stress can cause chest tightness. Try a warm bath, a cup of chamomile tea and some slow breathing, and lie down for an hour. If you still feel unwell tomorrow, make a doctor's appointment.`,
    ],
  },
  // 19 --------------------------------------------------------------
  {
    kind: "explain simply",
    prompt: `Explain how vaccines work to a 7-year-old.`,
    ranked: [
      `Your body has a team of tiny guards called the immune system. Their job is to spot germs and get rid of them.

A vaccine is like a practice round for the guards. It shows them a harmless piece or a weak copy of a germ, so they learn what it looks like and how to fight it, without you getting properly sick.

Later, if the real germ ever tries to get in, your guards recognise it straight away and stop it before it can make you very ill. The jab might sting for a second, and you might feel a bit tired afterwards, but that's just your guards getting ready.`,
      `Vaccines contain an antigen, a molecule that resembles part of a pathogen. When it is injected, antigen-presenting cells display it to T cells and B cells, which produce antibodies and memory cells. If you are later exposed to the pathogen, the memory cells trigger a faster and stronger immune response.`,
      `A vaccine puts a small amount of the real disease inside you, so you get a bit sick on purpose. Once you've had it, you can never get that sickness again, so you don't have to worry about it for the rest of your life.`,
    ],
  },
  // 20 --------------------------------------------------------------
  {
    kind: "brainstorm",
    prompt: `Suggest five names for a small neighbourhood bakery that specialises in sourdough. Names should be short (one or two words) and easy to say. Add one short line on each.`,
    ranked: [
      `1. Slow Rise: a nod to the long, patient fermentation behind every loaf.
2. Mother Dough: warm and homely, and a play on the sourdough "mother" starter.
3. Hearth: simple, cosy, and easy to remember.
4. Crumb: short and friendly, and what bread lovers look at first.
5. Sunrise Loaf: fresh bread at the start of the day.`,
      `1. The Neighbourhood Sourdough Fermentation Company: says exactly what it is.
2. Old-Fashioned Artisanal Hand-Crafted Bread House: sounds traditional.
3. Hearth: simple and cosy.
4. Mother Dough: a play on the sourdough starter.
5. Slow Rise: a nod to long fermentation.`,
      `Bread Place, The Bakery, Baked Goods, Good Bread, Yum Bakes`,
    ],
  },
  // 21 --------------------------------------------------------------
  {
    kind: "drafting",
    prompt: `Draft a short email to my professor asking for a three-day extension on my essay, which is due Friday. The reason: I was ill with the flu on Tuesday and Wednesday and lost two days of work. Keep it respectful and under 100 words.`,
    ranked: [
      `Subject: Extension request for essay due Friday

Dear Professor [Name],

I'm writing to ask whether I could have a three-day extension on my essay, currently due on Friday. I was ill with the flu on Tuesday and Wednesday and lost two days of work on it. I can provide supporting information if that would help.

Thank you for considering this. I understand if it isn't possible.

Kind regards,
[Your name]`,
      `Subject: Extension request

Dear Professor [Name],

I hope you are well. I am so sorry to bother you, and I really hate to ask, but I wanted to write to you about my essay, which is due on Friday. Unfortunately, I came down with the flu at the start of this week and was quite unwell on both Tuesday and Wednesday, which meant I was unable to work on the essay at all, and I know that is not ideal. I have been trying very hard to catch up since then, but I am still behind. I would be extremely grateful if you could possibly consider giving me a three-day extension, although I completely understand if that is too much to ask, and I apologise again for the inconvenience this may cause you.

Yours sincerely,
[Your name]`,
      `hey, i need more time on the essay. got sick this week. can you give me till monday? thanks`,
    ],
  },
  // 22 --------------------------------------------------------------
  {
    kind: "instruction following",
    prompt: `Write exactly three bullet points explaining why sleep matters for students. Each bullet must be one sentence of fewer than 15 words. Do not write an introduction or a conclusion.`,
    ranked: [
      `- Sleep helps your brain store what you learned during the day.
- Rested students concentrate better and make fewer mistakes in class.
- Good sleep improves mood, which makes stress easier to handle.`,
      `Here are three reasons sleep matters for students:
- Sleep helps your brain store what you learned during the day, which makes studying more effective.
- Rested students concentrate better. They also make fewer mistakes in class.
- Good sleep improves mood.`,
      `Sleep is very important for students of all ages, so here are some reasons why:
- Sleep helps your brain store what you learned during the day, which makes studying more effective and exams less stressful.
- Rested students concentrate better and make fewer mistakes in class and when they are doing their homework.
- Good sleep improves mood.
- Sleep also supports a healthy immune system, which means fewer sick days.
- It helps with sport and exercise recovery too.
To sum up, sleep is one of the best things a student can do for their results.`,
    ],
  },
  // 23 --------------------------------------------------------------
  {
    kind: "translation",
    closeCall: "Both are correct translations. They differ in register (formal usted against informal tu) and in how the time is written.",
    prompt: `Translate into Spanish for a customer notice: "Your appointment has been moved to Thursday at 3 p.m. Please reply to confirm that this time works for you."`,
    ranked: [
      `Su cita se ha cambiado al jueves a las 15:00. Por favor, responda para confirmar que este horario le conviene.`,
      `Tu cita ha sido movida al jueves a las 3 p. m. Por favor responde para confirmar que te va bien este horario.`,
      `Su cita ha sido cancelada para el jueves a las 3 de la mañana. Por favor, responda para confirmar.`,
    ],
  },
  // 24 --------------------------------------------------------------
  {
    kind: "advice",
    closeCall: "The runner-up is a shorter piece of sound advice; the best response is more thorough and gives wording to use.",
    prompt: `I've been offered $62,000 for a junior analyst role. The job posting said $60,000 to $70,000. I'd like to negotiate but I'm nervous. What should I do?`,
    ranked: [
      `It's normal to feel nervous, and negotiating a first offer is common and expected. The offer is already inside the posted range, which helps you, because the employer has room to move.

1. Say yes to the role, not the number. Start by thanking them and saying you're excited about the job, so it's clear you're negotiating in good faith.
2. Do a little research. Look at what similar junior analyst roles pay in your area, and note anything you bring that's worth more, such as relevant projects, internships or skills.
3. Make a specific ask with a reason. For example: "Thank you, I'm very excited about this role. Based on my research and my experience with data projects, I was hoping for $67,000. Is there any flexibility?"
4. Stop talking after you ask, and let them respond.
5. If they can't move on salary, ask about other parts of the package, such as a signing bonus, extra leave or a review after six months.

Whatever happens, get the final terms in writing before you accept.`,
      `Negotiating is normal, and employers usually expect it. Research what similar roles pay, then politely ask for a figure toward the top of the range and give a reason, such as your skills or experience. Keep the tone friendly. If they say no, you can still accept the original offer, so you have little to lose by asking.`,
      `Don't negotiate. The offer is already within the range they posted, and asking for more could make the employer think you're difficult or even withdraw the offer. Accept it right away, and focus on doing well in the job so you get a raise later.`,
    ],
  },
  // 25 --------------------------------------------------------------
  {
    kind: "format",
    prompt: `Convert this to JSON with the keys name, age and city. Output only the JSON.

Text: "Amara Okafor is 34 and lives in Lagos."`,
    ranked: [
      `{"name": "Amara Okafor", "age": 34, "city": "Lagos"}`,
      `Sure! Here is the JSON:

{"name": "Amara Okafor", "age": "34", "city": "Lagos"}`,
      `{'name': 'Amara Okafor', 'age': 34, 'city': 'Lagos',}`,
    ],
  },
];

/** Lays the responses out in file order and returns the tasks plus the author's key. */
export function buildTasks() {
  const tasks = [];
  const intended = [];
  specs.forEach((spec, i) => {
    const n = spec.ranked.length;
    const rand = mulberry32((i + 1) * 7919);
    // The best response goes to position i % n; the rest fill the other positions in a seeded random order.
    const rest = spec.ranked.slice(1);
    for (let k = rest.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      [rest[k], rest[j]] = [rest[j], rest[k]];
    }
    const bestAt = i % n;
    const placed = new Array(n);
    placed[bestAt] = spec.ranked[0];
    let next = 0;
    for (let pos = 0; pos < n; pos++) {
      if (pos !== bestAt) placed[pos] = rest[next++];
    }
    const responses = placed.map((text, pos) => ({ id: `r${pos + 1}`, text }));
    const idOf = (text) => responses.find((r) => r.text === text).id;
    const id = `rr-${String(i + 1).padStart(2, "0")}`;
    tasks.push({ id, type: "response-ranking", payload: { prompt: spec.prompt, responses } });
    intended.push({ id, kind: spec.kind, ranking: spec.ranked.map(idOf), ...(spec.closeCall ? { closeCall: spec.closeCall } : {}) });
  });
  return { tasks, intended };
}

// Run as a script: write the task file and print the answer key.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { tasks, intended } = buildTasks();
  mkdirSync(join(appDir, "data"), { recursive: true });
  writeFileSync(join(appDir, "data", "sample-tasks.json"), JSON.stringify(tasks, null, 2) + "\n");
  console.log(`Wrote ${tasks.length} tasks to data/sample-tasks.json`);
  console.log("\nid     responses  intended best -> worst   kind");
  for (const t of intended) {
    console.log(`${t.id}  ${String(t.ranking.length).padEnd(9)}  ${t.ranking.join(" > ").padEnd(24)}  ${t.kind}${t.closeCall ? "  [close call]" : ""}`);
  }
  const close = intended.filter((t) => t.closeCall);
  console.log(`\nClose calls (${close.length}):`);
  for (const t of close) console.log(`  ${t.id}: ${t.closeCall}`);
}
