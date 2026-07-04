# settings

The settings page only displays the actual adjustable content of the current system and does not write“It may be supported in the future”parameters.

### What can be adjusted currently?

#### 1. LLM service configuration

You can modify it directly on the page:

* `API Base`
* `API Key`
* `Model`
* `Temperature`

These configurations will take effect immediately after being saved, and there is no need to manually restart the backend.

#### 2. Default parameters for special training

The current page supports two types of special training default values:

* **Number of questions per round**
* **topic divergence**

They affect new training sessions you start in the future and will not change old sessions you have already started.

#### 3. Copilot prediction Agent

You can check the prediction agent to be enabled in Interview Copilot on the settings page. The current focus is not“The more you open, the better”, but open the right one.

A more direct understanding is:

* `Technical questions`: Continue to dig deeper into the underlying layers and details.
* `Project experience`: Turning to real project scenarios
* `pressure question`: Simulation challenges and rebuttals
* `behavioral examination`: Shift to communication, collaboration and behavioral issues
* `Scale out`:Expand from current issues to related areas

### Correct use

1. If you just want to run the system, first `.env` The minimum configuration is provided here.
2. After running through, go to the page **settings** Make daily adjustments.
3. Before changing the LLM configuration, first confirm that the new model and interface are indeed available.
4. When changing the special training parameters, do not fill up the number of questions and divergence at once.
5. When changing Copilot Agent, select according to your real interview scenario, do not“look stronger”Fully open.

### Usage suggestions

* If you want to make daily training more stable, give priority to changing the number of questions and divergence, and don’t change models frequently first.
* If Copilot's recommendations are too scattered, reduce the number of prediction agents first, and then see if the results are more focused.
* The settings page solves“How to adjust the current system”, is not an alternative to the deployment configuration page.
