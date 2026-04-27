INSERT INTO "equipment_types" ("name")
VALUES ('None')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "equipment_types" ("name")
VALUES ('Cable')
ON CONFLICT ("name") DO NOTHING;
