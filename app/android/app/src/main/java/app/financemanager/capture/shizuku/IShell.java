package app.financemanager.capture.shizuku;

import android.os.IBinder;
import android.os.IInterface;
import android.os.Parcel;
import android.os.RemoteException;

/**
 * Shizuku 端 UserService 与主进程的跨进程通信接口。
 *
 * 简化版：直接使用 Android Binder 机制，不依赖 AIDL 编译工具。
 * 参考：AutoAccounting 项目的 IUserService.aidl
 */
public interface IShell extends IInterface {

    /** 描述接口名称 */
    String DESCRIPTOR = "app.financemanager.capture.shizuku.IShell";

    /** 执行 shell 命令 */
    String execCommand(String command) throws RemoteException;

    /** Shizuku server 的 destroy 方法 */
    void destroy() throws RemoteException;

    /**
     * Binder 代理，用于跨进程调用。
     */
    static class Proxy implements IShell {
        private final IBinder mRemote;

        Proxy(IBinder remote) {
            mRemote = remote;
        }

        @Override
        public IBinder asBinder() {
            return mRemote;
        }

        @Override
        public String execCommand(String command) throws RemoteException {
            Parcel data = Parcel.obtain();
            Parcel reply = Parcel.obtain();
            try {
                data.writeInterfaceToken(DESCRIPTOR);
                data.writeString(command != null ? command : "");
                mRemote.transact(TXN_EXEC_COMMAND, data, reply, 0);
                reply.readException();
                return reply.readString();
            } finally {
                data.recycle();
                reply.recycle();
            }
        }

        @Override
        public void destroy() throws RemoteException {
            Parcel data = Parcel.obtain();
            Parcel reply = Parcel.obtain();
            try {
                data.writeInterfaceToken(DESCRIPTOR);
                mRemote.transact(TXN_DESTROY, data, reply, 0);
                reply.readException();
            } finally {
                data.recycle();
                reply.recycle();
            }
        }
    }

    /**
     * Binder Stub 实现，由 UserService 继承。
     */
    abstract static class Stub extends android.os.Binder implements IShell {

        @Override
        public IBinder asBinder() {
            return this;
        }

        @Override
        public boolean onTransact(int code, Parcel data, Parcel reply, int flags)
                throws RemoteException {
            data.enforceInterface(DESCRIPTOR);
            switch (code) {
                case TXN_EXEC_COMMAND: {
                    String command = data.readString();
                    String result = execCommand(command);
                    reply.writeNoException();
                    reply.writeString(result != null ? result : "");
                    return true;
                }
                case TXN_DESTROY: {
                    destroy();
                    reply.writeNoException();
                    return true;
                }
                case IBinder.INTERFACE_TRANSACTION: {
                    reply.writeString(DESCRIPTOR);
                    return true;
                }
                default:
                    return super.onTransact(code, data, reply, flags);
            }
        }

        public static IShell asInterface(IBinder obj) {
            if (obj == null) {
                return null;
            }
            return new Proxy(obj);
        }
    }

    static final int TXN_EXEC_COMMAND = IBinder.FIRST_CALL_TRANSACTION;
    static final int TXN_DESTROY = IBinder.FIRST_CALL_TRANSACTION + 16777114;
}
