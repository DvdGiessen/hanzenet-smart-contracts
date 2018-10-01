import { addr, CodeQuery, Contract, InitQuery, Template, TemplateFieldType } from "../../contract";

interface EnergyTemplate {
    context: addr;
    amount: number;
}

/**
 * Energy production and consumption contract.
 *
 * @author Daniël van de Giessen
 */
export default class EnergyContract extends Contract<EnergyTemplate> {
    public type: string = "Energy";
    public version: string = "1.0";
    public description: string = "Registers production or comsuption of energy.";

    public template: Template<EnergyTemplate> = {
        context: { type: TemplateFieldType.addr, desc: "The context address for the energy production or consumption", name: "context" },
        amount: { type: TemplateFieldType.float, desc: "The amount of energy produced (positive) or consumed (negative)", name: "amount" }
    };

    public async init(
        from: addr, block: number, miner: addr, previousBlockTimestamp: number, previousBlockHash: string, query: InitQuery
    ): Promise<void> {
        await query("CREATE", "traders", `(
            context VARCHAR(35) NOT NULL,
            address VARCHAR(35) NOT NULL,
            PRIMARY KEY (context, address)
        )`, []);
        await query("CREATE", "producers", `(
            context VARCHAR(35) NOT NULL,
            address VARCHAR(35) NOT NULL,
            trader VARCHAR(35) NOT NULL,
            labels TSVECTOR NOT NULL,
            PRIMARY KEY (context, address),
            FOREIGN KEY (context, trader) REFERENCES traders (context, address) ON DELETE RESTRICT
        )`, []);
        await query("CREATE", "consumers", `(
            context VARCHAR(35) NOT NULL,
            address VARCHAR(35) NOT NULL,
            trader VARCHAR(35) NOT NULL,
            labels TSVECTOR NOT NULL,
            PRIMARY KEY (context, address),
            FOREIGN KEY (context, trader) REFERENCES traders (context, address) ON DELETE RESTRICT
        )`, []);
        await query("CREATE", "energy", `(
            context VARCHAR(35) NOT NULL,
            trader VARCHAR(35) NOT NULL,
            block BIGINT NOT NULL,
            labels TSVECTOR NOT NULL,
            balance DECIMAL NOT NULL,
            PRIMARY KEY (context, trader, block, labels),
            FOREIGN KEY (context, trader) REFERENCES traders (context, address) ON DELETE CASCADE
        )`, []);
    }

    public async code(
        payload: EnergyTemplate, from: addr, block: number, miner: addr, previousBlockTimestamp: number, previousBlockHash: string, query: CodeQuery
    ): Promise<"OK" | string> {
        let type: "producers" | "consumers";
        if (payload.amount > 0) {
            type = "producers";
        } else if (payload.amount < 0) {
            type = "consumers";
        } else {
            return "Amount can not be zero.";
        }

        if ((
            await query("SELECT", type, `
                WHERE context = $1 AND address = $2
            `, [payload.context, from])
        ).rows.length !== 1) {
            return "This address is not on the list of allowed " + type + " within the given context address.";
        }

        await query("INSERT", "energy", `
            (context, trader, block, labels, balance)
            SELECT
                ` + type + `.context,
                ` + type + `.trader,
                $3,
                ` + type + `.labels,
                $4
            FROM
                ` + type + `
            WHERE
                ` + type + `.context = $1
                AND
                ` + type + `.address = $2
            ON CONFLICT (context, trader, block, labels) DO UPDATE SET balance = energy.balance + EXCLUDED.balance
        `, [payload.context, from, block, payload.amount]);

        return "OK";
    }
}
