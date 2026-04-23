import Sidebar from './Sidebar'
import Header from './Header'
import Footer from './Footer'

const Layout = ({ children, title }) => {
    return (
        <div className="layout-container">
            <Sidebar />
            <div className="main-content">
                <Header title={title} />
                <main style={{ flex: 1, position: 'relative', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                    {children}
                </main>
                <Footer />
            </div>
        </div>
    )
}

export default Layout
