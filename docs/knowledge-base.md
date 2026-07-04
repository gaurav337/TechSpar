# Question bank and knowledge base

in current products“question bank”Yes press**training areas**The organization does not maintain a separate external knowledge base backend.

More importantly, it is not a traditional“Fixed question list”.

In TechSpar, the question bank is essentially a**Dynamic question base**: The system will not simply select a few old questions for you to do. Instead, it will use the question bank, portraits, historical training results and current mastery as input to dynamically generate questions that should be practiced more in this round.

### Understand the current model first

Enter the left navigation **question bank** Finally, you maintain two types of content in a certain field:

* **core knowledge base**: Core knowledge points in Markdown form, defining which knowledge boundaries should be covered in this field, and affecting the question setting and scoring reference in this field.
* **High frequency question bank**: High-frequency questions, error-prone points, and interview lists compiled by yourself are used to tell the system which test points should be covered first.

### Why is the question bank the core design?

Many people see“question bank”These two words will be associated with a fixed list of questions by default, but this logic is not here.

The input that actually participates in formulating the question includes at least:

* **Core knowledge base search results**: Tell the system what key concepts, principles, boundaries and common pitfalls there are in this field.
* **High frequency question bank**: Tell the system which problems occur more frequently and which test points deserve priority coverage.
* **Historical training records**: This prevents the questions you have just practiced from appearing again and lets the system know how you have answered recently.
* **Weak points and mastery**: Decide whether to continue to make up for shortcomings in this round, or to expand in a deeper and wider direction.

So the final question is not“Extracted from question bank”, but the system uses this information to**Dynamically generated for this round of training**.

That is to say:

* Traditional question bank products: first have a batch of fixed questions, and then let you do them
* TechSpar: First determine what you should practice most now, and then generate the most appropriate questions for this round

This is why the question bank here is not an affiliate page, but the core infrastructure in the entire closed loop.

### Correct way to use

1. The system will have a batch of default training fields built-in and automatically generate a basic training base for each field. `README.md`.
2. After entering a certain field, first read **core knowledge base**, change it directly according to your interview direction.
3. If the default content is not enough, add more `.md` document, breaking the key points into smaller topics.
4. in **High frequency question bank** The tab page is supplemented with frequently asked questions, common mistakes and shorthand lists.
5. If the default domain is not enough, add a custom domain yourself.
6. After completion, return to the home page and select **Special intensive training**, and select this area to start practicing.
7. After the training, the weak points, mastery, and review results will continue to be written back to the system, affecting subsequent question generation.

### What is currently supported and what is not supported

* Current page focuses on support **Markdown text editing**.
* The core knowledge document needs to be `.md`.
* If you have PDF, TXT or old question bank materials, it is recommended to extract the key points first and then organize them into Markdown files.
* Currently none“Wait for activation status after uploading”“Check Bind Knowledge Base”This type of process.

### Recommended writing method

* `README.md`:Write an overview, core concepts, and common pitfalls in this field.
* Split file: Split by subtopics, for example `Index.md`,`affairs.md`,`lock.md`.
* High-frequency question bank: written in short question lists, judgment points, and answer checklists to facilitate the system to prioritize covering these high-value test points.

The bigger the question bank, the better. More important to the training effect are: content focus, unified terminology, clear boundaries between questions and answers, and the ability to provide a stable, searchable, and reusable basis for dynamic question generation.
