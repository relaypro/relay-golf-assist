import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

const uri = process.env.MONGODB_URI
mongoose.connect(uri, {useNewUrlParser: true})
const relayPgaSchema = {
    session_id: String,
    state: [String]
}
const PgaDB = mongoose.model("relaypga", relayPgaSchema, 'relaypga')
export default PgaDB