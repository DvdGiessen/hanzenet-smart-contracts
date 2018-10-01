import { addr, CodeQuery, Contract, InitQuery, Template, TemplateFieldType } from "../../contract";

interface TraderTemplate {
    context: addr;
    address: addr;
    allowed: boolean;
}

/**
 * Trader address management contract.
 *
 * @author Daniël van de Giessen
 */
export default class TraderContract extends Contract<TraderTemplate> {
    public type: string = "Trader";
    public version: string = "1.0";
    public description: string = "Manages the trader addresses for a given context address.";

    public template: Template<TraderTemplate> = {
        context: { type: TemplateFieldType.addr, desc: "The context address for which to modify the trader addresses", name: "context" },
        address: { type: TemplateFieldType.addr, desc: "The trader address to allow or deny", name: "address" },
        allowed: { type: TemplateFieldType.bool, desc: "Whether to allow (true) or deny (false) the trader address", name: "allowed" }
    };

    public async init(
        from: addr, block: number, miner: addr, previousBlockTimestamp: number, previousBlockHash: string, query: InitQuery
    ): Promise<void> {
        await query("CREATE", "traders", `(
            context VARCHAR(35) NOT NULL,
            address VARCHAR(35) NOT NULL,
            PRIMARY KEY (context, address)
        )`, []);
    }

    public async code(
        payload: TraderTemplate, from: addr, block: number, miner: addr, previousBlockTimestamp: number, previousBlockHash: string, query: CodeQuery
    ): Promise<"OK" | string> {
        if (from !== payload.context) {
            return "Only the context owner can allow or deny trader addresses.";
        }

        if (payload.allowed) {
            await query("INSERT", "traders", `
                (context, address)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
            `, [payload.context, payload.address]);
        } else {
            if ((
                await query("SELECT", "producers", `
                    WHERE context = $1 AND trader = $2
                `, [payload.context, payload.address])
            ).rows.length > 0) {
                return "Cannot deny trader, there are still producers linked to it.";
            }
            if ((
                await query("SELECT", "consumers", `
                    WHERE context = $1 AND trader = $2
                `, [payload.context, payload.address])
            ).rows.length > 0) {
                return "Cannot deny trader, there are still consumers linked to it.";
            }

            await query("DELETE", "traders", `
                WHERE context = $1 AND address = $2
            `, [payload.context, payload.address]);
        }
        return "OK";
    }
}
