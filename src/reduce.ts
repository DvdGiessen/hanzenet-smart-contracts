import { addr, CodeQuery, Contract, InitQuery, Template, TemplateFieldType } from "../../contract";

interface ReduceTemplate {
    context: addr;
    block: number;
    originalLabels: string;
    amount: number;
    labelsToRemove: string;
}

/**
 * Energy label reduction contract.
 *
 * @author Daniël van de Giessen
 */
export default class ReduceContract extends Contract<ReduceTemplate> {
    public type: string = "Reduce";
    public version: string = "1.0";
    public description: string = "Removes labels for a given amount of energy.";

    public template: Template<ReduceTemplate> = {
        context: { type: TemplateFieldType.addr, desc: "The context address for the reduction", name: "context" },
        block: { type: TemplateFieldType.uint, desc: "The block for which energy is being reduced", name: "block" },
        originalLabels: { type: TemplateFieldType.str, desc: "The exact set of labels from which energy is reduced", name: "originalLabels" },
        amount: { type: TemplateFieldType.float, desc: "The amount of energy to reduce", name: "amount" },
        labelsToRemove: { type: TemplateFieldType.str, desc: "The labels which are to be removed", name: "labelsToRemove" }
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
        payload: ReduceTemplate, from: addr, block: number, miner: addr, previousBlockTimestamp: number, previousBlockHash: string, query: CodeQuery
    ): Promise<"OK" | string> {
        if ((
            await query("SELECT", "traders", `
                WHERE context = $1 AND address = $2
            `, [payload.context, from])
        ).rows.length !== 1) {
            return "This address is not allowed to have a energy balance within the given context address.";
        }

        if (payload.amount <= 0) {
            return "The amount to reduce must be positive.";
        }

        // Yes, we are querying the traders table. Yes, this has nothing to do with our check. Turns out,
        // the options for building SELECT queries are a tad limited. So we use this little workaround.
        // Since, given the check above that the trader exists, we know that the traders table isn't empty,
        // we do a SELECT on this table with a WHERE-clause unrelated to the table. If we get zero rows
        // returned, we know the WHERE-clause evaluated to False. If rows are returned, it was True.
        if ((
            await query("SELECT", "traders", `WHERE
                (STRIP($1::TSVECTOR) || STRIP($2::TSVECTOR)) != STRIP($1::TSVECTOR)
                OR
                TS_DELETE(STRIP($1::TSVECTOR), TSVECTOR_TO_ARRAY(STRIP($2::TSVECTOR))) = STRIP($1::TSVECTOR)
            `, [payload.originalLabels, payload.labelsToRemove])
        ).rows.length > 0) {
            return "The labels to remove should be a non-empty subset of the current set of labels.";
        }

        const currentBalance = await query("SELECT", "energy", `
            WHERE context = $1 AND trader = $2 AND block = $3 AND labels = STRIP($4::TSVECTOR)
        `, [payload.context, from, payload.block, payload.originalLabels]);
        if (currentBalance.rows.length !== 1) {
            return "This address does not have energy with the given labels in the given block.";
        }
        if (currentBalance.rows[0].balance < payload.amount) {
            return "This address does not have enough energy with the given labels in the given block.";
        }

        await query("UPDATE", "energy", `
            SET balance = energy.balance - $5
            WHERE context = $1 AND trader = $2 AND block = $3 AND labels = STRIP($4::TSVECTOR)
        `, [payload.context, from, payload.block, payload.originalLabels, payload.amount]);
        await query("INSERT", "energy", `
            (context, trader, block, labels, balance)
            VALUES ($1, $2, $3, TS_DELETE(STRIP($4::TSVECTOR), TSVECTOR_TO_ARRAY(STRIP($5::TSVECTOR))), $6)
            ON CONFLICT (context, trader, block, labels) DO UPDATE SET balance = energy.balance + EXCLUDED.balance
        `, [payload.context, from, payload.block, payload.originalLabels, payload.labelsToRemove, payload.amount]);

        return "OK";
    }
}
