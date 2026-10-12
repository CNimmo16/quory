import { MySQLDriver } from "./MySQLDriver";

it("uses server-side binding and returns the actual query rows", async () => {
  const driver = Object.create(MySQLDriver.prototype) as MySQLDriver;
  const rows = [{ name: "\\' OR 1=1 --\0雪" }];
  const execute = jest.fn().mockResolvedValue([rows, []]);
  driver.pool = { execute } as unknown as MySQLDriver["pool"];
  expect(
    await driver.exec("SELECT name FROM users WHERE name = ?", [rows[0]!.name])
  ).toEqual(rows);
  expect(execute).toHaveBeenCalledWith(
    "SELECT name FROM users WHERE name = ?",
    [rows[0]!.name]
  );
});
