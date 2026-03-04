import { motion } from 'framer-motion'

export default function Disclaimer() {
    return (
        <section className="container disclaimer-wrap">
            <motion.div
                className="disclaimer-box"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
            >
                <div className="disclaimer-emoji">⚠️</div>
                <h3>Work in Progress</h3>
                <p>
                    OnyxBrowser is actively under development. Some features may not perform
                    as expected, and you may encounter bugs or incomplete functionality. We
                    appreciate your patience and feedback as we continue to improve the product.
                </p>
            </motion.div>
        </section>
    )
}
