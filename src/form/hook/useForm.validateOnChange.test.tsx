import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import useForm, { UseFormParams } from "@/form/hook/useForm"

const wrapper = ({ children }: { children: React.ReactNode }) => <>{children}</>

const tooShort = (value: string) => {
  if (value.length < 3) throw new Error("Too short")
}

function setup(params: UseFormParams) {
  const hook = renderHook(() => useForm(params), { wrapper })
  const type = (name: string, value: unknown) =>
    act(() => {
      hook.result.current.onChange({
        ...hook.result.current.form.inputs[name],
        value,
      })
    })
  const violations = (name: string) =>
    (hook.result.current.form.inputs[name].violations ?? []).map((v) => v.message)

  return { ...hook, type, violations }
}

describe("useForm validateOnChange", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows the error after the pause, not before", () => {
    const { type, violations } = setup({
      form: {
        validateOnChange: true,
        inputs: { name: { validator: tooShort }, other: {} },
      },
      data: { name: "Alice", other: "" },
    })

    type("name", "Al")
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(violations("name")).toEqual([])

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(violations("name")).toEqual(["Too short"])
  })

  it("waits a number of milliseconds when given one", () => {
    const { type, violations } = setup({
      form: { validateOnChange: 200, inputs: { name: { validator: tooShort } } },
      data: { name: "Alice" },
    })

    type("name", "Al")
    act(() => {
      vi.advanceTimersByTime(199)
    })
    expect(violations("name")).toEqual([])
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(violations("name")).toEqual(["Too short"])
  })

  it("restarts the pause on each keystroke", () => {
    const { type, violations } = setup({
      form: { validateOnChange: true, inputs: { name: { validator: tooShort } } },
      data: { name: "Alice" },
    })

    type("name", "A")
    act(() => {
      vi.advanceTimersByTime(800)
    })
    type("name", "Al")
    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(violations("name")).toEqual([])
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(violations("name")).toEqual(["Too short"])
  })

  it("does not validate without the option", () => {
    const { type, violations } = setup({
      form: { inputs: { name: { validator: tooShort } } },
      data: { name: "Alice" },
    })

    type("name", "Al")
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(violations("name")).toEqual([])
  })

  it("shows no error on a field that was never edited", () => {
    const { type, violations } = setup({
      form: {
        validateOnChange: true,
        inputs: { name: { validator: tooShort }, email: { required: true } },
      },
      data: { name: "Alice", email: "" },
    })

    type("name", "Al")
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(violations("name")).toEqual(["Too short"])
    expect(violations("email")).toEqual([])
  })

  it("clears the error at once when the field is valid again", () => {
    const { type, violations } = setup({
      form: { validateOnChange: true, inputs: { name: { validator: tooShort } } },
      data: { name: "Alice" },
    })

    type("name", "Al")
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(violations("name")).toEqual(["Too short"])

    type("name", "Ali")
    expect(violations("name")).toEqual([])
  })

  it("keeps the error while the field stays invalid", () => {
    const { type, violations } = setup({
      form: { validateOnChange: true, inputs: { name: { validator: tooShort } } },
      data: { name: "Alice" },
    })

    type("name", "Al")
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    type("name", "A")

    expect(violations("name")).toEqual(["Too short"])
  })

  it("validates the fields that depend on the edited one", () => {
    const { type, violations } = setup({
      form: {
        validateOnChange: true,
        inputs: {
          password: {},
          confirm: {
            dependsOn: ["password"],
            validator: (value: string, data: any) => {
              if (value !== data.password) throw new Error("Does not match")
            },
          },
          untouched: { required: true },
        },
      },
      data: { password: "abc", confirm: "abc", untouched: "" },
    })

    // Never edited: the dependent field shows no error
    type("password", "abcd")
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(violations("confirm")).toEqual([])

    type("confirm", "abcd")
    type("password", "abcde")
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(violations("confirm")).toEqual(["Does not match"])

    type("password", "abcd")
    expect(violations("confirm")).toEqual([])
    expect(violations("untouched")).toEqual([])
  })

  it("lets a field choose its own pause, or opt out", () => {
    const { type, violations } = setup({
      form: {
        validateOnChange: true,
        inputs: {
          fast: { validateOnChange: 100, validator: tooShort },
          off: { validateOnChange: false, validator: tooShort },
        },
      },
      data: { fast: "Alice", off: "Alice" },
    })

    type("fast", "Al")
    type("off", "Al")
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(violations("fast")).toEqual(["Too short"])
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(violations("off")).toEqual([])
  })

  describe("asynchronous validators", () => {
    const taken = (answers: Record<string, Promise<void>>) => (value: string) =>
      answers[value]

    it("waits for the answer", async () => {
      let reject!: (error: Error) => void
      const { type, violations } = setup({
        form: {
          validateOnChange: true,
          inputs: {
            name: {
              validator: taken({
                bob: new Promise((_, r) => {
                  reject = r
                }),
              }) as any,
            },
          },
        },
        data: { name: "" },
      })

      type("name", "bob")
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(violations("name")).toEqual([])

      await act(async () => {
        reject(new Error("Already taken"))
      })
      expect(violations("name")).toEqual(["Already taken"])
    })

    it("ignores an answer that arrives after a more recent keystroke", async () => {
      let reject!: (error: Error) => void
      const validator = vi.fn((value: string) =>
        value === "bob"
          ? new Promise<void>((_, r) => {
              reject = r
            })
          : Promise.resolve()
      )
      const { type, violations } = setup({
        form: { validateOnChange: true, inputs: { name: { validator } } },
        data: { name: "" },
      })

      type("name", "bob")
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      type("name", "bobby")

      await act(async () => {
        reject(new Error("Already taken"))
      })
      expect(violations("name")).toEqual([])

      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
      expect(violations("name")).toEqual([])
      expect(validator).toHaveBeenLastCalledWith("bobby", expect.anything())
    })
  })

  describe("submission", () => {
    it("still validates every field", async () => {
      const onSubmit = vi.fn()
      const { result, violations } = setup({
        form: {
          validateOnChange: true,
          inputs: { name: { validator: tooShort }, email: { required: true } },
        },
        data: { name: "Alice", email: "" },
        onSubmit,
      })

      await act(async () => {
        await result.current.onSubmit()
      })

      expect(violations("email")).toEqual(["This field is required"])
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it("keeps the server violations until their field is edited", async () => {
      const { result, type, violations } = setup({
        form: {
          validateOnChange: true,
          inputs: { email: {}, name: { validator: tooShort } },
          onSubmit: async () => {
            throw {
              violations: [{ propertyPath: "email", message: "Already taken" }],
            }
          },
        },
        data: { email: "a@b.c", name: "Alice" },
        onError: () => {},
      })

      await act(async () => {
        await result.current.onSubmit()
      })
      expect(violations("email")).toEqual(["Already taken"])

      type("name", "Alicia")
      expect(violations("email")).toEqual(["Already taken"])

      type("email", "d@e.f")
      expect(violations("email")).toEqual([])
    })
  })
})
