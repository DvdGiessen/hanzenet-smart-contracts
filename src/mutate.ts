import { addr, CodeQuery, Contract, InitQuery, Template, TemplateFieldType } from "../../contract";

interface MutateTemplate {
    context: addr;
    trader: addr;
    block: number;
    labels: string;
    amount: number;
    description: string;
}

/**
 * Energy mutation contract.
 *
 * @author Daniël van de Giessen
 */
export default class MutateContract extends Contract<MutateTemplate> {
    public type: string = "Mutate";
    public version: string = "1.0";
    public description: string = "Mutates the energy balance for a given trader address.";

    public template: Template<MutateTemplate> = {
        context: { type: TemplateFieldType.addr, desc: "The context address for the mutation", name: "context" },
        trader: { type: TemplateFieldType.addr, desc: "The trader address for which to mutate the energy balance", name: "trader" },
        block: { type: TemplateFieldType.uint, desc: "The block for which energy is being mutated", name: "block" },
        labels: { type: TemplateFieldType.str, desc: "The exact set of labels for which the energy balance is mutated", name: "labels" },
        amount: { type: TemplateFieldType.float, desc: "The amount by which the balance should be mutated", name: "amount" },
        description: { type: TemplateFieldType.str, desc: "An optional description for the mutation", name: "description" }
    };

    public async init(
        from: addr, block: number, miner: addr, previousBlockTimestamp: number, previousBlockHash: string, query: InitQuery
    ): Promise<void> {
        await query("CREATE", "traders", `(
            context VARCHAR(35) NOT NULL,
            address VARCHAR(35) NOT NULL,
            PRIMARY KEY (context, address)
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
        payload: MutateTemplate, from: addr, block: number, miner: addr, previousBlockTimestamp: number, previousBlockHash: string, query: CodeQuery
    ): Promise<"OK" | string> {
        if (from !== payload.context) {
            return "Only the context owner can mutate energy balances.";
        }

        if ((
            await query("SELECT", "traders", `
                WHERE context = $1 AND address = $2
            `, [payload.context, payload.trader])
        ).rows.length !== 1) {
            return "The given address is not allowed to have a energy balance within the given context address.";
        }

        await query("INSERT", "energy", `
            (context, trader, block, labels, balance)
            VALUES ($1, $2, $3, STRIP($4::TSVECTOR), $5)
            ON CONFLICT (context, trader, block, labels) DO UPDATE SET balance = energy.balance + EXCLUDED.balance
        `, [payload.context, payload.trader, payload.block, payload.labels, payload.amount]);

        return "OK";
    }
}
