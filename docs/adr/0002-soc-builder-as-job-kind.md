# Represent SOC table building as a SocJob kind

The SOC table builder will use the existing `SocJob` infrastructure with an explicit `BUILD` kind while existing jobs default to `CHECK`. This reuses ownership, queue, storage, audit, retention, and SOC navigation, while each kind has its own handler, legal status transitions, retry behavior, and detail UI; build jobs do not create `SocCheckResult` rows or enter compliance confirmation. A separate build model was rejected because it would duplicate infrastructure and weaken the intended future build-to-check lineage.
