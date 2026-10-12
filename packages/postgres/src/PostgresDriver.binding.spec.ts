import { PostgresDriver } from "./PostgresDriver";

it("passes values separately to postgres.js and returns query rows", async () => {
  const driver = Object.create(PostgresDriver.prototype) as PostgresDriver;
  const rows = [{ name: "\\' OR 1=1 --雪" }];
  const unsafe = jest.fn().mockResolvedValue(rows);
  driver.sql = { unsafe } as unknown as PostgresDriver["sql"];
  expect(
    await driver.exec("SELECT name FROM users WHERE name = $1", [rows[0]!.name])
  ).toEqual(rows);
  expect(unsafe).toHaveBeenCalledWith(
    "SELECT name FROM users WHERE name = $1",
    [rows[0]!.name]
  );
});

it("ends its client once across concurrent teardown calls", async () => {
  const driver = Object.create(PostgresDriver.prototype) as PostgresDriver;
  const end = jest.fn().mockResolvedValue(undefined);
  driver.sql = { end } as unknown as PostgresDriver["sql"];
  await Promise.all([driver.teardown(), driver.teardown()]);
  expect(end).toHaveBeenCalledTimes(1);
});
