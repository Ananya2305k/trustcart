"""Builds a SYNTHETIC support-ticket dataset (training/tickets.csv).

Each row is: opener + core complaint + closer. Every row carries a
`core_id`, so train.py can hold out whole complaints (GroupShuffleSplit) and
never evaluate on a wording variant of a complaint it trained on.

IMPORTANT: this is template data written by hand. Scores measured on it show
that the pipeline works; they do NOT predict accuracy on real customers.
Replace tickets.csv with real labelled tickets (columns: text,label,core_id)
and re-run train.py to get meaningful numbers.
"""
import csv
import itertools
import random
from pathlib import Path

CORES = {
    "Delivery": [
        "my order has not arrived yet",
        "the package is still showing as shipped and it is very late",
        "where is my parcel, the delivery date has passed",
        "the courier says delivered but I never received anything",
        "my tracking has not updated for several days",
        "delivery is delayed again, when will it reach me",
        "the parcel was left at the wrong address",
        "I was told it would arrive this week but nothing came",
        "the estimated delivery window is over and my order is missing",
        "the shipment seems stuck and I cannot find where it is",
    ],
    "Refund & Return": [
        "I want to return this item and get my money back",
        "my refund has not been credited yet",
        "how long will the refund take after approval",
        "I requested a refund last week and heard nothing",
        "please explain why my return request was rejected",
        "I need to send the product back, how do I start a return",
        "the refund amount is less than what I paid",
        "I returned the product but the refund is still pending",
        "can I exchange this for a different item instead of a refund",
        "my refund request status has not changed in days",
    ],
    "Payment": [
        "I was charged twice for the same order",
        "money was deducted from my account but the order failed",
        "the payment page keeps showing an error",
        "my card was charged more than the order total",
        "I do not see the payment confirmation for my purchase",
        "the payment status still says pending after I paid",
        "I want an invoice for my payment",
        "the discount code did not apply and I paid full price",
        "my upi transaction went through but the order is not placed",
        "there is an unknown charge related to my order",
    ],
    "Product Quality": [
        "the item arrived damaged",
        "the product stopped working after two days",
        "I received the wrong item",
        "the product looks different from the pictures",
        "there is a crack on the screen of the device I got",
        "the item is missing a part from the box",
        "the quality is poor and the stitching is coming apart",
        "the colour is not what I ordered",
        "the box was open and the product looks used",
        "the size does not match the description",
    ],
    "Account": [
        "I cannot log in to my account",
        "I forgot my password and the reset does not work",
        "please change the email address on my account",
        "I want to delete my account and my data",
        "my account details show the wrong name",
        "I did not receive any verification message",
        "I keep getting logged out every few minutes",
        "how do I update my phone number on my profile",
        "someone else may have accessed my account",
        "the sign up page says my email already exists but I never registered",
    ],
    "Order Change": [
        "I want to cancel my order",
        "please change the delivery address of my order",
        "I ordered the wrong quantity and need to edit it",
        "can I add another item to the order I just placed",
        "I placed the order by mistake, please stop it",
        "I need to update my phone number on an existing order",
        "can you cancel before it ships",
        "please correct the pin code I entered at checkout",
        "I would like to change the size on my order",
        "cancel the order and release the items",
    ],
    "General": [
        "do you ship to other cities",
        "what are your support hours",
        "is this product available in other colours",
        "when will this item be back in stock",
        "how does the trustcart return policy work",
        "do you offer gift wrapping",
        "how can I contact the seller directly",
        "do you have a store I can visit",
        "can you recommend a similar product",
        "I have a general question about how ordering works",
    ],
}

# More distinct complaints per class: wording diversity matters far more than
# repeating the same complaint with different openers.
EXTRA_CORES = {
    "Delivery": [
        "I am still waiting for my shipment and it is past the promised date",
        "the tracking page shows no movement and the parcel is delayed",
        "nobody has delivered my package and the courier is not picking up calls",
        "my items were supposed to be here by now but the delivery is late",
        "the order shows shipped but there is no sign of the delivery",
        "the delivery person marked it delivered although I was home and got nothing",
        "it has been over a week and the shipment has not reached my city",
        "the courier returned my parcel without trying to deliver it",
        "please tell me the location of my package, the delivery keeps getting delayed",
        "my delivery keeps getting rescheduled and I am tired of waiting for the parcel",
    ],
    "Refund & Return": [
        "I would like to send back the product I bought and receive a refund",
        "I have not received my money back for the returned product",
        "my return was picked up but the refund has not been processed",
        "what is the status of my refund request",
        "the refund was rejected and I do not understand the reason",
        "I want to exchange the item or get a refund within the return window",
        "I returned my purchase two weeks ago and still no refund in my bank",
        "can you approve my return, the product does not suit me and I want to give it back",
        "refund was promised in five days but it has been longer than that",
        "please start the return process and refund me for the item",
    ],
    "Payment": [
        "the transaction failed but my bank shows the amount debited",
        "I paid for the order but the payment is not confirmed",
        "I got a double debit on my card for one purchase",
        "the checkout payment keeps declining even though my card is fine",
        "I need a gst invoice or receipt for the amount I paid",
        "the coupon was not applied at payment and I was charged the full amount",
        "the amount charged does not match the price shown at checkout",
        "my wallet balance was deducted but there is no order in my list",
        "I was billed an extra fee that I did not agree to at payment",
        "payment went through twice because the page froze",
    ],
    "Product Quality": [
        "the product I received is defective and does not turn on",
        "the item is broken and the packaging was crushed",
        "I got a completely different product from what I ordered",
        "the material feels cheap and nothing like the listing photos",
        "one piece is missing from the set I received",
        "the device overheats and stopped working properly",
        "the item has scratches and stains, it looks like a used product",
        "the product is faulty, the zip is broken and the fabric is torn",
        "what I got does not match the description at all, it is fake quality",
        "the bottle leaks and the lid is cracked on arrival",
    ],
    "Account": [
        "I am unable to sign in even with the right password",
        "I never got the otp to verify my email",
        "please update the name and email on my profile",
        "my account is locked after too many login attempts",
        "I want to permanently close my account",
        "I think my account was hacked because I see activity that is not mine",
        "the reset link in my email has expired and I cannot get back into my account",
        "I want to change my registered mobile number on the profile",
        "my profile page will not save my details",
        "I cannot register, it keeps saying the email is already taken",
    ],
    "Order Change": [
        "please stop my order from being processed, I want to cancel it",
        "I entered the wrong address at checkout and need to correct it",
        "I want to change the item colour on the order I placed today",
        "can I modify my order to add two more units before dispatch",
        "kindly cancel this purchase, I ordered it twice by accident",
        "I need the delivery moved to my office address instead",
        "I would like to remove one product from my existing order",
        "please edit the contact number on my pending order",
        "cancel my order, I found a better price elsewhere",
        "I want to change the quantity of an item in the order I just paid for",
    ],
    "General": [
        "do you deliver to my area and how long does it usually take",
        "I would like to know more about your warranty policy",
        "are there any upcoming sales or offers",
        "can you tell me the material of this product before I buy",
        "is cash on delivery available for all products",
        "do you sell products in bulk for businesses",
        "how do I use the trust features on this website",
        "what payment methods do you accept",
        "is this item suitable as a gift for a child",
        "I am new here, how do I find a product in your catalogue",
    ],
}
for _label, _cores in EXTRA_CORES.items():
    CORES[_label].extend(_cores)

OPENERS = ["", "Hello, ", "Hi team, ", "Good morning. ", "I need help. ", "Please help me, ", "Hey, "]
CLOSERS = [
    "",
    " Please let me know what to do.",
    " Thank you.",
    " Can you look into it?",
    " I would appreciate a quick answer.",
    " Waiting for your reply.",
]


def build(seed: int = 7):
    rng = random.Random(seed)
    rows = []
    core_id = 0
    for label, cores in CORES.items():
        for core in cores:
            combos = list(itertools.product(OPENERS, CLOSERS))
            rng.shuffle(combos)
            for opener, closer in combos[:8]:
                body = core[0].upper() + core[1:] if not opener else core
                rows.append(
                    {"text": f"{opener}{body}.{closer}".strip(), "label": label, "core_id": core_id}
                )
            core_id += 1
    rng.shuffle(rows)
    return rows


if __name__ == "__main__":
    out = Path(__file__).with_name("tickets.csv")
    rows = build()
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["text", "label", "core_id"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {out}")
