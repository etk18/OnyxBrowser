import uvicorn
import multiprocessing

if __name__ == '__main__':
    multiprocessing.freeze_support()
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
